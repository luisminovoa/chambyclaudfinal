# Sistema completo de contratación — diseño funcional (revisión 3)

> **Estado: PENDIENTE DE APROBACIÓN.** No se implementará nada hasta que este
> diseño quede aprobado. Documento vivo — ver también la versión visual con
> diagramas y wireframes: https://claude.ai/code/artifact/fc322b6c-516d-42ae-9d6e-03d30b68e3b1
>
> **Corrección respecto a la revisión 1**: se afirmaba que aceptar un
> postulante no producía ningún efecto en el trabajo. Al revisar los
> *triggers* de Postgres (no solo el código TypeScript) se confirmó que la
> asignación automática ya existe y funciona en producción — ver §1. Esta
> revisión se construye sobre esa base real.

## 1. Diagrama de estados

**Trabajo (`jobs.status`)**: `abierto` → *(empleador acepta postulante)* →
`en_progreso` → *(empleador marca completado)* → `completado`. Desde
`abierto` o `en_progreso`, el empleador puede cancelar → `cancelado`
(terminal).

**Postulación (`job_applications.status`)**: `pendiente` → *(empleador
acepta)* → `aceptado`, o → *(rechazo manual o cascada automática)* →
`rechazado`. Existe además `retirado` en el enum, sin ningún camino de
código que lo setee hoy (ver §4/§8).

**Ya en producción** — `handle_application_accepted()`
(`supabase/migrations/0001_init.sql`, líneas 179-202), disparada por el
`UPDATE` que hace `updateApplicationStatus()`:
1. `jobs.assigned_worker_id` ← trabajador aceptado.
2. `jobs.status` ← `en_progreso`.
3. Las demás postulaciones `pendiente` del mismo trabajo → `rechazado`.
4. Corre como `security definer`: no depende de los permisos RLS del
   empleador para tocar filas de otros usuarios.

La calificación mutua en `/jobs/[id]` ya está condicionada a
`status = 'completado'` + ser dueño o trabajador asignado — tampoco requiere
cambios.

## 2. Flujo del trabajador

1. Explora y postula a un trabajo `abierto` (existente).
2. Su postulación queda `pendiente`; **nuevo**: puede retirarla mientras
   siga pendiente.
3. Rama rechazado: queda en su historial con el estado real (existente).
4. Rama contratado: **nuevo** — aviso "Fuiste contratado" + timeline de
   seguimiento visible en el detalle del trabajo.
5. Realiza el trabajo (coordinación fuera de la plataforma — el chat es la
   prioridad 2 de MVP v1.0, fuera de este PR).
6. Cuando el empleador marca `completado`, aparece el formulario de
   calificación mutua (existente).

## 3. Flujo del empleador

1. Publica y recibe postulaciones (existente).
2. **Nuevo**: confirmación antes de aceptar — "Vas a contratar a {nombre}.
   Las demás postulaciones se rechazarán automáticamente."
3. Acepta un postulante → dispara la cascada automática del §1 (existente,
   sin cambios de lógica).
4. **Nuevo**: ve la tarjeta del trabajador asignado (avatar, nombre, oficio)
   y el timeline en el detalle del trabajo.
5. Marca completado — ya existe en el dashboard; **nuevo**: también
   disponible en el detalle del trabajo.
6. Califica al trabajador (existente).

## 4. Reglas de negocio

| # | Regla | Estado |
| --- | --- | --- |
| R1 | Un trabajo activo admite como máximo un trabajador asignado (limitación del esquema: una sola columna `assigned_worker_id`) | Vigente |
| R2 | Solo se postula a trabajos `abierto` | Vigente |
| R3 | Aceptar rechaza automáticamente las demás postulaciones `pendiente` | Vigente |
| R4 | Calificación mutua solo con `completado` + participante | Vigente |
| R5 | Retirar postulación solo mientras esté `pendiente` | **Propuesta** |
| R6 | Cancelar un trabajo `en_progreso`: ¿la postulación aceptada pasa a `retirado`, o se deja como está? | **Decisión pendiente** |
| R7 | Un trabajo `cancelado` no se reabre — se publica uno nuevo | **Decisión pendiente** |
| R8 | La confirmación antes de aceptar es obligatoria en la UI | **Propuesta** |

## 5. Modelo de datos (actual, sin modificar)

- **`jobs`**: `id`, `employer_id`, `status`, `assigned_worker_id`,
  `positions_needed` (hoy solo informativo — ver multi-vacante en §6),
  `created_at`/`updated_at` (este último se sobreescribe en cada cambio).
- **`job_applications`**: `id`, `job_id`, `worker_id`, `status`, `message`.
- **`profiles`**: `id`, `role`, `full_name`, `city`, `category`, `is_active`.
- **`ratings`** + vista `rating_summary`: `job_id`, `rater_id`, `rated_id`,
  `score` (1–5), `comment` (≤1000 car.).

## 6. Cambios propuestos en la base de datos

Una migración aditiva y retrocompatible (`0002_hiring_tracking.sql`,
columnas nullable, sin backfill):

```sql
alter table public.jobs
  add column hired_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz;

create or replace function public.handle_application_accepted()
returns trigger as $$
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    -- guarda: impide aceptar si el trabajo ya no está abierto
    -- (corrige la condición de carrera de aceptación doble, ver §8/§10)
    if not exists (
      select 1 from public.jobs where id = new.job_id and status = 'abierto'
    ) then
      raise exception 'Este trabajo ya no acepta postulantes';
    end if;

    update public.jobs
      set assigned_worker_id = new.worker_id, status = 'en_progreso', hired_at = now()
      where id = new.job_id;

    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id and id <> new.id and status = 'pendiente';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

`updateJobStatus("completado"/"cancelado")` se extiende (en la Server
Action) para escribir `completed_at`/`cancelled_at`.

**Fuera de esta fase**: soporte real de multi-vacante (`positions_needed >
1`) requeriría una tabla `job_assignments` nueva — no se construye salvo que
se priorice explícitamente.

## 7. Permisos por rol

| Acción | Trabajador | Empleador (dueño) | Empleador (no dueño) | Admin |
| --- | --- | --- | --- | --- |
| Postular | Sí | — | — | Solo si rol worker |
| Retirar su postulación | Solo si `pendiente` | — | — | — |
| Ver postulantes | — | Sí | — | Sí |
| Aceptar/rechazar postulante | — | Sí | — | — |
| Marcar completado | — | Solo si `en_progreso` | — | Vía moderación |
| Cancelar el trabajo | — | Solo `abierto`/`en_progreso` | — | Sí |
| Ver tarjeta del asignado | Solo si es él mismo | Sí | — | Sí |
| Calificar a la contraparte | Solo si asignado + completado | Solo si completado | — | — |

## 8. Casos límite

| Severidad | Caso | Detalle |
| --- | --- | --- |
| Alta | Aceptación concurrente de dos postulantes | Sin guarda, el segundo `UPDATE` pisa silenciosamente al primero. Mitigado por la guarda del §6. |
| Media | Cancelar un trabajo `en_progreso` | La postulación aceptada queda en `aceptado` aunque el trabajo esté `cancelado` — depende de R6. |
| Media | El enum `retirado` nunca se usa | Depende de R5: conectarlo a una acción real o documentarlo como reservado. |
| Media | Admin cambia el estado por fuera del flujo | `adminUpdateJobStatus` no pasa por el trigger; reabrir un trabajo puede dejar `assigned_worker_id` desactualizado. |
| Baja | Trabajador quiere retirarse tras ser aceptado | Sin flujo de disputa; el empleador cancela y republica. |
| Baja | Calificar dos veces | Ya bloqueado por restricción única (error Postgres `23505`, ya manejado). |

## 9. Wireframes

Ver la versión visual (bocetos de baja fidelidad, 4 pantallas: aceptar
postulante con confirmación, detalle del trabajo — vista empleador con
timeline y tarjeta del asignado, detalle del trabajo — vista trabajador
contratado, calificación mutua) en el artifact enlazado arriba.

## 10. Riesgos técnicos

| Riesgo | Severidad | Mitigación propuesta |
| --- | --- | --- |
| Condición de carrera en aceptación concurrente | Alta | Guarda `raise exception` en la migración del §6 |
| Sin pruebas automatizadas sobre la máquina de estados | Media | Fuera de alcance de este PR; recomendar como ítem propio |
| Sin tiempo real (hay que refrescar para ver cambios) | Media | No resolver aquí — compartir infraestructura de Realtime con las prioridades "chat" y "notificaciones" de MVP v1.0 |
| Migración manual sin pipeline automatizado | Baja | Aplicar en Supabase SQL Editor y verificar antes de mergear el código que depende de ella |
| Función del trigger con privilegio elevado (`security definer`) | Baja | Ya acotado a esta única función; no se propone ampliarla |

## 11. Preguntas abiertas para tu aprobación

1. **R6**: ¿al cancelar un trabajo `en_progreso`, la postulación aceptada
   pasa a `retirado` automáticamente, o se deja como está?
2. **R7**: ¿confirmamos que un trabajo `cancelado` nunca se reabre?
3. **R5**: ¿conectamos "retirar postulación" en esta fase, o queda
   reservado para después?
4. **§8**: cuando un admin cambia el estado por fuera del flujo normal,
   ¿lo bloqueamos o queda como acción de moderación consciente?
5. **Alcance general**: ¿aprobamos las secciones 1–10 tal cual para pasar a
   la implementación, o hay algo que agregar, quitar o cambiar?
