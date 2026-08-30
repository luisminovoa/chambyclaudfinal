# Chamby — Confirmación bilateral de trabajo terminado (FASE 8 / C4-G21)
## Documento de Diseño v1.0

**Estado:** APROBADO — implementación en curso. Arquitectura y decisiones de
producto cerradas explícitamente por el propietario del repositorio tras la
auditoría técnica C4-G21 (misma conversación).
**Autor:** Claude Code
**Fecha:** 2026-08-30

---

## 1. Por qué este documento existe

Regla de `CLAUDE.md`: "Business-logic or UX changes... get proposed as a
design doc in `docs/` and approved before implementation, not bundled
silently into an unrelated PR." La finalización bilateral de una chamba es
un cambio de autorización y de flujo de negocio (quién puede mover
`jobs.status` y bajo qué condición), no un bugfix — corresponde este
documento antes de tocar código.

## 2. Problema

Hoy `completeJob()` (`src/lib/actions/jobs.ts`) es 100% unilateral del
empleador: el trabajador no tiene ninguna acción, columna, RLS ni
notificación en el cierre de una chamba. El objetivo es intercalar un
reporte del trabajador antes de que `status` pueda pasar a `completado`.

## 3. Estado real auditado (antes de este cambio)

- `jobs.status` (enum `job_status`: `abierto|en_progreso|completado|cancelado`)
  solo lo mueve el empleador (`completeJob`/`updateJobStatus`/`cancelJob`,
  todos gateados por `employer_id = auth.uid()`) o un admin
  (`adminUpdateJobStatus()`, sin restricción de transición, sin `completed_at`,
  sin `job_state_history` — deuda preexistente, documentada, no tocada aquí).
- RLS real vigente en `jobs` (no la de `0001_init.sql`, sino la reescrita en
  `0008_harden_v2_v3_rls.sql` para cerrar V3 — calificaciones falsas):
  ```sql
  revoke update on public.jobs from authenticated;
  grant update (status, completed_at, cancelled_at) on public.jobs to authenticated;

  create policy "jobs_update_owner_or_admin" on public.jobs for update
    using (admin or (auth.uid() = employer_id and status in ('abierto','en_progreso')))
    with check (admin or (auth.uid() = employer_id and status in ('cancelado','completado')));
  ```
  El worker no tiene HOY ningún acceso de escritura a `jobs` — ni por policy
  ni por grant de columna.
- `cancelJob()` solo permite cancelar `status='abierto'` — **ya es imposible
  cancelar un job `en_progreso`**, por nadie. Esto elimina la necesidad de
  diseñar reglas de "cancelación tras reporte del worker": ese caso no existe.
- `submitRating()` (`ratings.ts`) exige `status='completado'` y ya soporta
  rating bilateral (empleador→trabajador y trabajador→empleador) desde
  FASE 4 — no requiere ningún cambio.
- `job_state_history` (enum `job_status`, `new_status not null`) no admite
  un estado nuevo sin tocar el enum.
- Notificaciones nacen de triggers `security definer` en `0004_notifications.sql`
  (nunca desde código TypeScript). `notify_job_status_changed()` ya notifica
  al worker cuando `status` pasa a `completado` (tipo `job_completed`).

## 4. Arquitectura elegida: B — timestamps aditivos

Comparada contra A (nuevo valor de enum, descartada por ser irreversible en
Postgres y por obligar a tocar los ~17 consumidores reales de `status`) y C
(tabla `job_completion_requests`, descartada por sobre-ingeniería frente a
un flujo lineal de 2 pasos ya simplificado por el hallazgo de `cancelJob()`).

Dos columnas nuevas en `jobs`, ambas nullable, sin default funcional:

- `worker_reported_finished_at timestamptz null` — momento del reporte del
  trabajador.
- `employer_confirmed_at timestamptz null` — momento de la confirmación
  final del empleador. Se escribe en el MISMO `UPDATE` que `completed_at` y
  `status='completado'` (una sola sentencia SQL, atómica por construcción).

`status` sigue significando exactamente lo mismo que hoy — solo se retrasa
el momento en que llega a `completado`. Ningún consumidor existente de
`status` (dashboard worker/employer, `JobCard`, `ratings.ts`, `admin/page.tsx`,
etc.) necesita cambiar.

## 5. Flujo

```
en_progreso
  → worker reporta (assigned_worker_id = auth.uid(), status='en_progreso',
    worker_reported_finished_at IS NULL)
  → UPDATE ... SET worker_reported_finished_at = now()
    WHERE ... AND worker_reported_finished_at IS NULL   (idempotente)
  → job_state_history (prev_status=new_status='en_progreso', notes=evento)
  → trigger AFTER UPDATE (OLD IS NULL, NEW IS NOT NULL) → notifica employer
    (tipo nuevo: job_completion_requested)
  → employer confirma (employer_id = auth.uid(), status='en_progreso',
    worker_reported_finished_at IS NOT NULL, employer_confirmed_at IS NULL)
  → UPDATE ... SET employer_confirmed_at = now(), completed_at = now(),
    status = 'completado' WHERE ... AND employer_confirmed_at IS NULL (idempotente)
  → job_state_history (prev_status='en_progreso', new_status='completado')
  → trigger existente notify_job_status_changed() → notifica worker (job_completed)
  → ambos pueden calificarse (submitRating(), sin cambios)
```

## 6. RLS futura

Se AMPLÍA la policy existente (no se reemplaza su rama employer), agregando
una rama nueva para el worker y una condición adicional a la rama del
empleador:

```sql
grant update (worker_reported_finished_at, employer_confirmed_at)
  on public.jobs to authenticated;

create policy "jobs_update_owner_or_admin" on public.jobs for update
  using (
    admin
    or (auth.uid() = employer_id and status in ('abierto','en_progreso'))
    or (auth.uid() = assigned_worker_id and status = 'en_progreso')
  )
  with check (
    admin
    or (auth.uid() = employer_id and status = 'cancelado')
    or (auth.uid() = employer_id and status = 'completado'
        and worker_reported_finished_at is not null)
    or (auth.uid() = assigned_worker_id and status = 'en_progreso'
        and employer_confirmed_at is null)
  );
```

El worker nunca puede alcanzar `employer_id`/`assigned_worker_id`/`status`/
`completed_at`/`cancelled_at` (siguen fuera del grant de columna para su
única vía de escritura relevante, y el `WITH CHECK` fija `status='en_progreso'`
para su rama). El empleador solo puede llegar a `status='completado'` si
`worker_reported_finished_at is not null` ya está en la fila.

## 7. Constraints

- CHECK `status = 'completado' → employer_confirmed_at is not null`
- CHECK `completed_at is not null → status = 'completado'`

Los otros dos invariantes de la auditoría (`employer_confirmed_at → worker_reported_finished_at`,
`worker_reported_finished_at → assigned_worker_id`) quedan garantizados por
la Server Action + RLS, no como CHECK de tabla (evitan acoplar el constraint
a lógica de negocio de dos columnas cruzadas más allá de lo necesario).

**Nota de compatibilidad con `adminUpdateJobStatus()`:** ese camino admin
existente puede, hoy, dejar `status='completado'` sin `completed_at` (nunca
lo setea). El primer CHECK propuesto (`status='completado' → employer_confirmed_at
not null`) **rompería ese camino admin** de la misma forma. Por eso el CHECK
final que se aplica es únicamente **B** (`completed_at not null → status='completado'`,
compatible con el estado admin actual porque nunca setea `completed_at`) —
**A queda documentado como invariante de aplicación, no como CHECK de DB**,
para no bloquear `adminUpdateJobStatus()` (fuera de alcance, no se modifica).

## 8. Notificaciones

- Nuevo tipo `job_completion_requested`: trigger `AFTER UPDATE` en `jobs`,
  `WHEN (OLD.worker_reported_finished_at IS NULL AND NEW.worker_reported_finished_at IS NOT NULL)`,
  notifica a `NEW.employer_id`. Mismo patrón `security definer set search_path = public`
  que el resto de `0004_notifications.sql`.
- `job_completed` (ya existente) se reutiliza sin cambios para la
  confirmación final — sigue dependiendo de `new.status = 'completado'`.

## 9. UI

- Worker (`dashboard/worker/page.tsx`, dentro de `activeApps`): botón
  "✅ Marcar trabajo terminado" cuando `status='en_progreso' && worker_reported_finished_at == null`;
  "⏳ Pendiente de confirmación del empleador" cuando ya reportó.
- Employer (`EmployerJobRow.tsx`, `JobActions.tsx`): el botón de completar
  solo se habilita cuando `worker_reported_finished_at != null`; mientras
  tanto, copy informativo.
- `/jobs/[id]/page.tsx`: badge derivado "Terminación reportada — esperando
  confirmación del empleador" cuando aplica. Sin nuevo valor de enum.
- CTA de rating simétrico para el worker en su dashboard (asimetría
  detectada en la auditoría: hoy solo `EmployerJobRow` tiene `showRatingCta`).

## 10. Fuera de alcance (explícito)

`ratings.ts`, `RatingForm.tsx`, `RatingStars.tsx`, RLS de `ratings`,
`cancelJob()`, `adminUpdateJobStatus()`, `AdminJobRow.tsx`, botón de
"rechazo" explícito, FASE 1–7, PR #35.
