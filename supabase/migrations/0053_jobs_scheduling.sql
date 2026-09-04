-- ============================================================
-- CHAMBY — FASE 3C (Calendario): horario confirmado del job +
-- garantía real anti-solapamiento.
-- ============================================================
-- Alcance exclusivo de esta migración: columnas de horario en jobs,
-- CHECK de coherencia, extensión btree_gist y constraint EXCLUDE.
-- No modifica job_applications, handle_application_accepted(), ninguna
-- policy RLS existente, ni agrega GRANT/REVOKE. No toca jobs.starts_at
-- (permanece date, sin uso, confirmada NULL en el 100% de las filas
-- reales antes de aplicar esta migración).
-- ============================================================

alter table public.jobs
  add column scheduled_start_at timestamptz null,
  add column scheduled_end_at timestamptz null;

alter table public.jobs
  add constraint jobs_scheduled_end_after_start
  check (
    scheduled_end_at is null
    or scheduled_start_at is null
    or scheduled_end_at > scheduled_start_at
  );

create extension if not exists btree_gist;

alter table public.jobs
  add constraint jobs_no_overlapping_worker_bookings
  exclude using gist (
    assigned_worker_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  )
  where (
    assigned_worker_id is not null
    and scheduled_start_at is not null
    and scheduled_end_at is not null
    and status = 'en_progreso'
  );
