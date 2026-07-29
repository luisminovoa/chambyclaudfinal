# Preselección, contratación multi-vacante y trabajo en curso

> **Estado: implementado** (migración `0011_job_assignments.sql`).
>
> Extiende `FLUJO-CONTRATACION.md` con dos capacidades que ese diseño no cubría:
> el estado intermedio de **preselección** y la contratación de **varias
> vacantes** en un mismo trabajo.

---

## 1. Por qué cambia el trigger de aceptación

`handle_application_accepted()` (revisión 0002) asumía una vacante por trabajo:
al aceptar una postulación rechazaba *todas* las demás y pasaba el trabajo a
`en_progreso`. Con `jobs.positions_needed > 1` eso hacía imposible cubrir el
resto de las vacantes — la segunda contratación fallaba con
*"Este trabajo ya no acepta postulantes"*.

La revisión 0011 mueve el cierre al final del ciclo:

| Momento | Antes | Ahora |
|---|---|---|
| 1ª contratación de N | rechaza al resto, cierra el trabajo | solo crea la asignación |
| N-ésima contratación | — (imposible) | rechaza pendientes/preseleccionados y cierra |
| Guarda de carrera | `status <> 'abierto'` → excepción | `count(aceptado) > positions_needed` → excepción |

`jobs.assigned_worker_id` se conserva (apunta al primer contratado) porque
varias vistas y políticas RLS existentes dependen de esa columna;
`job_assignments` es la fuente completa a partir de ahora.

## 2. Estados

**`job_applications.status`** — se añade `preseleccionado` entre `pendiente` y
`aceptado`. Es reversible: el empleador puede quitar la preselección y la
postulación vuelve a `pendiente`.

```
pendiente ⇄ preseleccionado ──► aceptado ──► (crea job_assignment)
    │            │
    └────────────┴──────────────► rechazado / retirado (terminales)
```

**`job_assignments.status`** — ciclo de vida de cada trabajador contratado:

```
asignado ──► confirmado ──► en_progreso ──► completado (terminal)
    │            │              │
    └────────────┴──────────────┴──► cancelado (terminal)
```

- `confirmado` lo marca el **trabajador** (confirma que asistirá).
- `en_progreso` y `completado` los marca el **empleador**.
- `cancelado` lo puede marcar cualquiera de las dos partes.

## 3. Cierre y reapertura del trabajo

`jobs.status` se deriva del conjunto de asignaciones, no de una sola:

- pasa a `completado` cuando **ninguna** asignación sigue activa
  (`asignado`/`confirmado`/`en_progreso`);
- vuelve a `abierto` si se cancela la última asignación activa, liberando la
  vacante para seguir contratando.

## 4. Por qué el modal de perfil usa `createAdminClient()`

Las políticas RLS de `profile_photos` y `verification_documents` (migración
0007) solo permiten leer al dueño (`auth.uid() = profile_id`). El empleador
necesita ver esa información al evaluar a un postulante, así que
`getWorkerFullProfile()` usa el cliente de servicio — pero **antes verifica**
que exista al menos una postulación de ese trabajador a un trabajo del
empleador que llama, y **nunca devuelve** `storage_path` ni `file_name` de los
documentos: solo el tipo y si están verificados.

## 5. Notificaciones

`notify_application_status_changed()` gana la rama `preseleccionado`
(`application_shortlisted`, prioridad alta) y acepta `preseleccionado` como
estado previo válido para el rechazo manual. El nuevo trigger
`notify_assignment_status_changed()` cubre inicio, finalización, confirmación y
cancelación de cada asignación.
