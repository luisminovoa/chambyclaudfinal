-- ============================================================
-- CHAMBY — jobs: INSERT solo con las columnas de publicación
--
-- Hallazgo de auditoría (verificado en Production): la única policy de
-- INSERT sobre public.jobs, jobs_insert_employer (0001), solo exigía
-- `auth.uid() = employer_id` y rol employer/admin, y `authenticated` (y
-- `anon`) tenían INSERT sobre TODAS las columnas. Un empleador podía, con
-- su propia sesión y la API REST, crear un job ya "asignado", "en
-- progreso" o "completado", con horario y fechas de contratación a su
-- gusto — saltándose handle_application_accepted() (0055), que es quien
-- debe fijar assigned_worker_id/status/hired_at/scheduled_*. Consecuencias:
-- lectura de perfiles arbitrarios vía assigned_worker_id (/jobs/[id]),
-- calificaciones a usuarios ajenos (ratings_insert_participant, 0007,
-- confía en jobs.assigned_worker_id + status='completado'), ocupación del
-- EXCLUDE anti-solapamiento (0053) y recordatorios/push hacia terceros
-- (send_job_reminders, 0056), o forzar created_at para fijar el orden del
-- listado.
--
-- FIX, dos capas independientes (mismo patrón que 0008, que ya usa
-- REVOKE de tabla + GRANT por columnas para UPDATE sobre jobs):
--
--   1. Privilegios. Se revoca INSERT de tabla a anon, authenticated y
--      PUBLIC, y se concede a authenticated SOLO sobre las 12 columnas
--      que createJob() (src/lib/actions/jobs.ts) realmente envía:
--        employer_id, title, description, category, city, address,
--        pay_amount, pay_type, positions_needed, department, province,
--        district.
--      El resto (id, status, assigned_worker_id, starts_at, hired_at,
--      completed_at, cancelled_at, worker_reported_finished_at,
--      employer_confirmed_at, scheduled_start_at, scheduled_end_at,
--      created_at, updated_at) no puede aparecer en la lista de columnas
--      de un INSERT de authenticated (42501 permission denied) y toma el
--      DEFAULT de la tabla. Cualquier columna futura queda bloqueada por
--      defecto hasta que se conceda explícitamente.
--
--   2. Policy. jobs_insert_employer se reemplaza conservando sus dos
--      condiciones originales y exigiendo además el estado inicial
--      legítimo: status='abierto' y NULL en assigned_worker_id,
--      hired_at, completed_at, cancelled_at, worker_reported_finished_at,
--      employer_confirmed_at, scheduled_start_at, scheduled_end_at y
--      starts_at. Es la segunda barrera: si algún día se concediera por
--      error INSERT sobre alguna de esas columnas, la policy lo sigue
--      rechazando. Los DEFAULT se aplican antes de evaluar WITH CHECK, así
--      que un INSERT sin esas columnas lo cumple.
--
-- No cambia: policies de SELECT/UPDATE/DELETE, el GRANT UPDATE por
-- columnas de 0008/0044, handle_application_accepted() (SECURITY DEFINER,
-- corre como dueño y hace UPDATE — no depende de estos privilegios), la
-- definición de la tabla, ni ninguna otra tabla. service_role y postgres
-- no se tocan.
--
-- Compatibilidad con createJob(): inserta un único objeto con exactamente
-- esas 12 columnas (address solo si viene) y encadena .select("id").single(),
-- que PostgREST traduce a INSERT ... RETURNING: RETURNING requiere SELECT
-- (tabla completa, sin cambios) y la policy jobs_select_all (using true),
-- no INSERT. postgrest-js solo envía `columns` y NULL explícitos en
-- inserts masivos (arrays), no con un objeto único.
--
-- Idempotencia: REVOKE sobre un privilegio ausente no falla; GRANT es
-- repetible; la policy usa DROP POLICY IF EXISTS.
--
-- Rollback: GRANT INSERT ON public.jobs TO authenticated (y anon si se
-- quisiera restaurar) y reaplicar la policy de 0001.
-- ============================================================

revoke insert on public.jobs from public;
revoke insert on public.jobs from anon;
revoke insert on public.jobs from authenticated;

grant insert (
  employer_id,
  title,
  description,
  category,
  city,
  address,
  pay_amount,
  pay_type,
  positions_needed,
  department,
  province,
  district
) on public.jobs to authenticated;

drop policy if exists "jobs_insert_employer" on public.jobs;
create policy "jobs_insert_employer"
  on public.jobs for insert
  with check (
    auth.uid() = employer_id
    and public.current_user_role() in ('employer', 'admin')
    and status = 'abierto'
    and assigned_worker_id is null
    and hired_at is null
    and completed_at is null
    and cancelled_at is null
    and worker_reported_finished_at is null
    and employer_confirmed_at is null
    and scheduled_start_at is null
    and scheduled_end_at is null
    and starts_at is null
  );
