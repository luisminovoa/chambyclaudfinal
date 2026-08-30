-- ============================================================
-- CHAMBY — FASE 8 (C4-G21): confirmación bilateral de trabajo terminado
--
-- Contexto (ver docs/FASE8-BILATERAL-COMPLETION.md para el diseño completo,
-- aprobado antes de esta migración): hoy `completeJob()`
-- (src/lib/actions/jobs.ts) es 100% unilateral del empleador. Esta
-- migración agrega el mecanismo mínimo para que el trabajador reporte
-- "terminé" y el empleador confirme antes de que `status` pase a
-- 'completado' — arquitectura B (timestamps aditivos) de la auditoría
-- C4-G21, elegida sobre nuevos valores de enum (irreversibles en Postgres)
-- y sobre una tabla de completion requests (sobre-ingeniería para un
-- flujo lineal de 2 pasos, dado que cancelJob() ya no permite cancelar un
-- job en_progreso).
--
-- Esta migración NO modifica el enum job_status, NO crea tablas nuevas,
-- NO modifica job_state_history (schema sin cambios: prev_status/new_status
-- iguales es válido para registrar un evento sin transición real), NO
-- toca RLS/grants de ratings/notifications/profiles, NO modifica
-- adminUpdateJobStatus() ni ninguna migración histórica.
-- ============================================================

-- ------------------------------------------------------------
-- Columnas nuevas en jobs (nullable, aditivas, retrocompatibles — mismo
-- patrón que hired_at/completed_at/cancelled_at en 0002_hiring_tracking.sql).
-- Jobs existentes (cualquier status) quedan con ambas en NULL, sin backfill.
-- ------------------------------------------------------------
alter table public.jobs
  add column if not exists worker_reported_finished_at timestamptz,
  add column if not exists employer_confirmed_at timestamptz;

-- ------------------------------------------------------------
-- Constraint: solo el invariante compatible con el estado real de
-- producción. `status='completado' -> employer_confirmed_at is not null`
-- NO se aplica como CHECK de tabla porque adminUpdateJobStatus()
-- (src/lib/actions/admin.ts, fuera de alcance de esta fase, no se
-- modifica) ya puede dejar `status='completado'` sin `completed_at` ni
-- `employer_confirmed_at` — un CHECK así rompería ese camino admin
-- existente. Ese invariante queda garantizado por la Server Action + RLS
-- del flujo normal (worker/employer), documentado en el diseño, no por
-- constraint de DB.
--
-- El invariante inverso SÍ es seguro como CHECK: `completed_at` nunca lo
-- setea ninguna ruta salvo completeJob()/adminUpdateJobStatus() (que
-- nunca lo toca), así que "completed_at no nulo implica status
-- completado" no tiene ningún camino existente que lo viole.
-- ------------------------------------------------------------
alter table public.jobs
  add constraint jobs_completed_at_requires_completado
  check (completed_at is null or status = 'completado');

-- ------------------------------------------------------------
-- Grants: puramente aditivo sobre el estado real de 0008_harden_v2_v3_rls.sql
-- (revoke update on public.jobs from authenticated; grant update (status,
-- completed_at, cancelled_at) to authenticated). Un GRANT UPDATE(columna)
-- adicional en Postgres AGREGA esa columna al conjunto de columnas
-- actualizables del rol — no reemplaza ni revoca las ya concedidas, así
-- que status/completed_at/cancelled_at siguen exactamente igual.
-- ------------------------------------------------------------
grant update (worker_reported_finished_at, employer_confirmed_at)
  on public.jobs to authenticated;

-- ------------------------------------------------------------
-- RLS: se reemplaza "jobs_update_owner_or_admin" (0008) por una versión
-- que AGREGA la rama del worker sin quitar nada de la rama del empleador
-- ni del admin.
--
-- Worker (USING, ve la fila ANTES del UPDATE): solo si es el trabajador
-- asignado y el job está en_progreso. Worker (WITH CHECK, ve la fila
-- RESULTANTE): status debe seguir siendo 'en_progreso' (el worker JAMÁS
-- puede terminar completando él mismo el job — eso es justo lo que esta
-- fase existe para impedir) y employer_confirmed_at debe seguir NULL (el
-- worker no puede fijar la columna del empleador, aunque GRANT no
-- distingue entre worker/employer dentro de `authenticated`, esta
-- condición sí lo hace vía RLS).
--
-- Employer: la rama de cancelación (-> 'cancelado') queda exactamente
-- igual que en 0008. La rama de completar (-> 'completado') ahora exige
-- adicionalmente que `worker_reported_finished_at` (de la fila NUEVA,
-- que el propio UPDATE del empleador no toca, así que su valor es el que
-- ya traía la fila) no sea NULL — sin este reporte previo, el empleador
-- no puede alcanzar 'completado' por esta vía.
-- ------------------------------------------------------------
drop policy if exists "jobs_update_owner_or_admin" on public.jobs;
create policy "jobs_update_owner_or_admin"
  on public.jobs for update
  using (
    public.current_user_role() = 'admin'
    or (auth.uid() = employer_id and status in ('abierto', 'en_progreso'))
    or (auth.uid() = assigned_worker_id and status = 'en_progreso')
  )
  with check (
    public.current_user_role() = 'admin'
    or (auth.uid() = employer_id and status = 'cancelado')
    or (
      auth.uid() = employer_id
      and status = 'completado'
      and worker_reported_finished_at is not null
    )
    or (
      auth.uid() = assigned_worker_id
      and status = 'en_progreso'
      and employer_confirmed_at is null
    )
  );

comment on column public.jobs.worker_reported_finished_at is
  'Fase 8 (C4-G21): momento en que el trabajador asignado reporta el trabajo como terminado. Solo el propio trabajador puede fijarla (RLS), solo mientras status=en_progreso, una sola vez (Server Action exige que sea NULL antes de escribir). No cambia status.';
comment on column public.jobs.employer_confirmed_at is
  'Fase 8 (C4-G21): momento de la confirmación final del empleador — se escribe en el mismo UPDATE que completed_at y status=completado. Solo alcanzable si worker_reported_finished_at ya no es NULL (RLS).';

-- ------------------------------------------------------------
-- Notificación: "el trabajador reportó terminado" -> notificar al
-- empleador. Mismo patrón que el resto de 0004_notifications.sql
-- (security definer, search_path fijo, destinatario/actor leídos de la
-- propia fila de jobs, nunca de un valor confiado del cliente). Dispara
-- solo en la transición NULL -> valor, así que un retry/doble UPDATE que
-- no cambie la columna (ya cubierto por el WHERE de la Server Action, ver
-- src/lib/actions/jobs.ts) no puede duplicar la notificación.
--
-- No se reutiliza el tipo `job_completed` (ya significa "el trabajo
-- terminó de verdad" y participa en el filtro `filter === "jobs"` de
-- getNotifications(), src/lib/actions/notifications.ts) — mezclar
-- significados rompería esa distinción. `job_completed` se conserva sin
-- ningún cambio para la confirmación final (notify_job_status_changed(),
-- 0004_notifications.sql, sigue dependiendo únicamente de
-- new.status='completado').
-- ------------------------------------------------------------
create or replace function public.notify_job_completion_requested()
returns trigger as $$
begin
  if new.worker_reported_finished_at is not null
     and old.worker_reported_finished_at is null then
    insert into public.notifications
      (user_id, type, title, body, data, priority, sender_id, job_id)
    values (
      new.employer_id,
      'job_completion_requested',
      'El trabajador indicó que terminó la chamba',
      'Revisa "' || new.title || '" y confirma si el trabajo quedó terminado.',
      jsonb_build_object('jobId', new.id),
      'high',
      new.assigned_worker_id,
      new.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_job_completion_requested on public.jobs;
create trigger on_job_completion_requested
  after update on public.jobs
  for each row execute function public.notify_job_completion_requested();
