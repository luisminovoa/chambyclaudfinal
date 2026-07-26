# Propuesta: flujo completo de contratación

> **Estado: PENDIENTE DE APROBACIÓN.** Este documento es la propuesta de diseño del PR #5.
> No se implementará nada hasta que el flujo y los estados queden aprobados.

## Problema actual

Aceptar un postulante solo cambia el estado de su postulación. Nunca se asigna
`assigned_worker_id` ni se pasa el trabajo a `en_progreso`, y la calificación mutua
depende de ese campo — por lo que hoy el ciclo nunca puede completarse desde la UI.

## Estados propuestos

Se reutilizan los estados existentes de la base de datos (sin migración de esquema):

```
                    ┌────────────┐
   publicar         │  ABIERTO   │  ← recibe postulaciones
  ──────────────►   └─────┬──────┘
                          │ aceptar postulante
                          ▼
                    ┌────────────┐
                    │EN_PROGRESO │  ← trabajo asignado, seguimiento activo
                    └─────┬──────┘
              finalizar   │            cancelar (empleador, en abierto
                          ▼            o en progreso) → CANCELADO
                    ┌────────────┐
                    │ COMPLETADO │  ← habilita calificación mutua
                    └────────────┘
```

## Transición clave: "Aceptar postulante" (atómica)

Al pulsar **Aceptar** sobre una postulación pendiente:

1. `job_applications.status` → `aceptado`.
2. `jobs.assigned_worker_id` → id del trabajador aceptado.
3. `jobs.status` → `en_progreso`.
4. Las demás postulaciones **pendientes** del mismo trabajo → `rechazado`
   automáticamente (los candidatos ven un estado honesto en su panel en vez de
   esperar para siempre). *Alternativa a decidir: dejarlas pendientes.*
5. Confirmación previa en la UI: "Vas a contratar a {nombre}. Las demás
   postulaciones se rechazarán automáticamente."

Implementación vía función SQL `accept_application(application_id)` con
`security definer` + verificación de ownership, para que los 4 pasos sean
atómicos (todo o nada). Se añade como migración nueva sin tocar el esquema.

## Seguimiento del trabajo (en progreso)

En el detalle del trabajo, visible para empleador y trabajador asignado:

- **Timeline de estados**: Publicado → Contratado → En progreso → Completado,
  con fechas y el componente Timeline del design system.
- **Tarjeta del trabajador asignado** (para el empleador): avatar, nombre,
  oficio, teléfono si existe.
- **Tarjeta del empleador** (para el trabajador): ya existe, se mantiene.
- El botón "Marcar completado" del dashboard del empleador se replica en el
  detalle del trabajo (hoy solo está en el dashboard).

## Finalizar y calificar

- Solo el **empleador** puede marcar `completado` (v1; si luego se quiere
  confirmación bilateral, se agrega en v2).
- Al completar: se muestran los formularios de calificación mutua **ya
  existentes** — empleador califica al trabajador asignado y viceversa.
  Esta parte no cambia: hoy ya está correctamente condicionada a
  `status = completado` + `assigned_worker_id`.

## Reglas y casos borde

| Caso | Regla propuesta |
| --- | --- |
| Trabajo con varias vacantes (`positions_needed > 1`) | El esquema actual solo admite **un** `assigned_worker_id`. v1: al aceptar al primer trabajador el trabajo pasa a `en_progreso` y deja de aceptar postulaciones. El soporte real multi-vacante requiere migración (tabla de asignaciones) y se propone como fase posterior. |
| Cancelar un trabajo `en_progreso` | Permitido al empleador (ya existe). La postulación aceptada pasa a `retirado` para liberar el historial del trabajador. |
| Trabajador quiere retirarse tras ser aceptado | Fuera de alcance v1 (requiere flujo de disputa); el empleador puede cancelar y re-abrir. |
| Postular a un trabajo `en_progreso` | Ya es imposible: el formulario solo aparece con `status = abierto`. |

## Cambios por archivo (cuando se apruebe)

- `supabase/migrations/0002_accept_application.sql` — función atómica.
- `src/lib/actions/jobs.ts` — `acceptApplication()` llama a la función y
  revalida rutas; `updateJobStatus("cancelado")` pasa la postulación aceptada
  a `retirado`.
- `src/components/ApplicantRow.tsx` — confirmación elegante antes de aceptar.
- `src/app/jobs/[id]/page.tsx` — timeline de seguimiento + tarjeta del
  asignado + botón "Marcar completado" para el dueño.
- `src/components/ui/Timeline.tsx` — nuevo componente del design system.

## Preguntas abiertas para el product owner

1. ¿Rechazo automático de las demás postulaciones al aceptar una? (recomendado)
2. ¿El trabajador debe poder confirmar la finalización (bilateral) o basta el
   empleador? (v1 propone: solo empleador)
3. Multi-vacante: ¿lo dejamos explícitamente para una fase con migración?
