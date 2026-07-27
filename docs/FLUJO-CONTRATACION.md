# Flujo de contratación: diagnóstico corregido y propuesta (revisión 2)

> **Estado: PENDIENTE DE APROBACIÓN.** No se implementará nada hasta que este
> alcance quede aprobado.
>
> **Nota de corrección**: la revisión 1 de este documento (y el hallazgo P3 de
> `docs/AUDITORIA.md`) afirmaban que "aceptar un postulante no asigna
> `assigned_worker_id` ni cambia el estado del trabajo". **Eso era incorrecto.**
> Solo revisé el código de la Server Action (`updateApplicationStatus`) sin
> revisar los *triggers* de la base de datos. Al leer
> `supabase/migrations/0001_init.sql` completo aparece la función
> `handle_application_accepted()` (líneas 179-202), con un trigger
> `AFTER UPDATE ON job_applications` que ya hace exactamente eso. Corrijo el
> diagnóstico aquí y en `docs/AUDITORIA.md`.

## Qué YA funciona hoy (verificado en el trigger + RLS, no solo en el código TS)

```sql
create or replace function public.handle_application_accepted()
returns trigger as $$
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    update public.jobs
      set assigned_worker_id = new.worker_id, status = 'en_progreso'
      where id = new.job_id;
    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id and id <> new.id and status = 'pendiente';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

Al pulsar "Aceptar" en `ApplicantRow` → `updateApplicationStatus(id, "aceptado")` →
`UPDATE job_applications SET status = 'aceptado'` (una llamada normal de
PostgREST, que sí dispara triggers de Postgres) →

1. ✅ `jobs.assigned_worker_id` se asigna automáticamente.
2. ✅ `jobs.status` pasa a `en_progreso` automáticamente.
3. ✅ Las demás postulaciones **pendientes** del mismo trabajo se rechazan
   automáticamente.
4. ✅ La política RLS `applications_update` ya permite al empleador dueño del
   trabajo hacer esta actualización; la función es `security definer`, así
   que sus efectos en cascada (que tocan filas de otros usuarios) no
   dependen de los permisos RLS del empleador.
5. ✅ "Marcar completado" (`updateJobStatus("completado")`) ya existe en
   `EmployerJobRow` dentro del dashboard del empleador, solo si el trabajo
   está `en_progreso`.
6. ✅ La calificación mutua en `/jobs/[id]` ya está condicionada a
   `status === "completado"` + `isOwner`/`isAssignedWorker` — ya funciona
   en cuanto el trabajo llega a ese estado.

**Conclusión: la máquina de estados y la transición atómica ya existen y
funcionan de punta a punta a nivel de base de datos.** No se necesita
migración nueva, ni función SQL nueva, ni cambios en las Server Actions
de estado.

## Qué SÍ falta (gaps reales, solo de interfaz — alcance revisado y reducido)

| # | Gap | Dónde |
| --- | --- | --- |
| G1 | Al aceptar, no hay confirmación previa: el empleador no ve el aviso "se rechazarán las demás postulaciones" antes de que ocurra | `ApplicantRow.tsx` |
| G2 | El detalle del trabajo (`/jobs/[id]`) no muestra ningún seguimiento del progreso (línea de tiempo) para trabajo `en_progreso` | `jobs/[id]/page.tsx` |
| G3 | El detalle del trabajo no muestra una tarjeta del trabajador asignado (el empleador solo lo ve en la lista de postulantes, mezclado con los rechazados) | `jobs/[id]/page.tsx` |
| G4 | "Marcar completado" solo existe en el dashboard del empleador, no en el detalle del trabajo — un empleador que entra desde el enlace del trabajo no lo encuentra ahí | `jobs/[id]/page.tsx` |
| G5 | El trabajador no tiene ninguna señal visual de "fuiste contratado, aquí va el seguimiento" más allá del badge de estado genérico | `jobs/[id]/page.tsx`, dashboard del trabajador |

## Propuesta de esta fase (solo UI, sin tocar el esquema ni las Server Actions de transición)

1. **Confirmación elegante** antes de aceptar (mismo patrón ya usado en
   `EmployerJobRow` para eliminar/cancelar — sin `window.confirm`):
   "Vas a contratar a {nombre}. Las demás postulaciones se rechazarán
   automáticamente." → Aceptar / Cancelar.
2. **Timeline de estados** en `/jobs/[id]` (nuevo componente
   `components/ui/Timeline.tsx` del design system) — Publicado → Contratado →
   En progreso → Completado, visible para empleador y trabajador asignado.
3. **Tarjeta del trabajador asignado** en el detalle del trabajo, para el
   empleador, una vez `assigned_worker_id` está seteado.
4. **Botón "Marcar completado"** también en el detalle del trabajo (mismo
   `updateJobStatus`, sin lógica nueva), visible solo para el dueño con
   `status === "en_progreso"`.
5. **Aviso claro al trabajador asignado**: badge o tarjeta destacando "Fuiste
   contratado para este trabajo" en el detalle y en su dashboard.

## Reglas y casos borde (sin cambios respecto a la revisión 1)

| Caso | Regla |
| --- | --- |
| Trabajo con varias vacantes (`positions_needed > 1`) | El esquema solo admite **un** `assigned_worker_id`. Al aceptar al primer trabajador, el trabajo pasa a `en_progreso` y dejan de aceptarse postulaciones nuevas (el formulario de postular ya solo aparece con `status = "abierto"`). Soporte multi-vacante real requeriría una tabla de asignaciones — se deja fuera de esta fase. |
| Cancelar un trabajo `en_progreso` | Ya permitido al empleador. La postulación aceptada **no** cambia de estado automáticamente hoy (queda en `aceptado` aunque el trabajo esté `cancelado`) — posible mejora menor a incluir en esta fase si se aprueba. |
| Trabajador quiere retirarse tras ser aceptado | Fuera de alcance (requeriría flujo de disputa). |

## Cambios por archivo (cuando se apruebe)

- `src/components/ApplicantRow.tsx` — confirmación en línea antes de aceptar.
- `src/components/ui/Timeline.tsx` — nuevo componente del design system.
- `src/app/jobs/[id]/page.tsx` — timeline, tarjeta del asignado, botón
  "Marcar completado" para el dueño.
- `docs/AUDITORIA.md` — corrección del hallazgo P3 (ya no es un P3 de
  "lógica faltante"; pasa a ser una mejora de UX menor).

**Sin migraciones nuevas. Sin cambios en `src/lib/actions/jobs.ts`** más allá,
opcionalmente, de decidir la regla de la fila "Cancelar en progreso" de la
tabla de arriba.

## Preguntas abiertas para el product owner

1. ¿Confirmamos el punto G1-G5 tal cual, o quieres agregar/quitar alguno?
2. Al cancelar un trabajo `en_progreso`, ¿la postulación aceptada debe pasar
   a `retirado` automáticamente, o se deja como está (aceptada, pero el
   trabajo cancelado)?
3. Multi-vacante: ¿confirmamos que queda fuera de esta fase?
