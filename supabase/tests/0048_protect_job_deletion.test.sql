-- ============================================================
-- Pruebas de regresión — 0048_protect_job_deletion.sql
-- ============================================================
-- Mismo harness que 0031/0028/0014/0009 (auth.uid() simulado con
-- `set role authenticated; set request.jwt.claim.sub = '<uuid>'`).
--
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real):
--
--   createdb chamby_job_delete_guard
--   psql -d chamby_job_delete_guard -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_job_delete_guard -c "CREATE SCHEMA auth;"
--   psql -d chamby_job_delete_guard -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_job_delete_guard -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_job_delete_guard -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_job_delete_guard -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0048, EN ORDEN
--     psql -d chamby_job_delete_guard -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_job_delete_guard -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   -- reduce los GRANT ALL de arriba a los mismos candados de columna
--   -- reales que ya viven en 0008/0013/0014/0019/0031, para que las
--   -- pruebas ejerzan las restricciones reales y no un GRANT ALL residual:
--   psql -d chamby_job_delete_guard -c "revoke update on public.jobs from authenticated; grant update (status, completed_at, cancelled_at) on public.jobs to authenticated;"
--   psql -d chamby_job_delete_guard -c "revoke update on public.job_applications from authenticated; grant update (status) on public.job_applications to authenticated;"
--   psql -d chamby_job_delete_guard -c "revoke update on public.reports from authenticated; grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at) on public.reports to authenticated;"
--   psql -d chamby_job_delete_guard -f supabase/tests/0048_protect_job_deletion.test.sql
--
-- Lectura: "RECHAZADO" debe terminar en ERROR (RLS deniega, "DELETE 0")
-- — nunca en un DELETE silencioso. "PERMITIDO" debe completarse sin
-- error ("DELETE 1"). Los conteos de integridad post-rechazo deben ser
-- IDÉNTICOS antes y después del intento de borrado.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('97100000-0000-4000-8000-000000000001', '{"role":"employer","full_name":"P1 Empleador A"}'::jsonb),
  ('97100000-0000-4000-8000-000000000002', '{"role":"employer","full_name":"P1 Empleador B"}'::jsonb),
  ('97100000-0000-4000-8000-000000000003', '{"role":"admin","full_name":"P1 Admin"}'::jsonb),
  ('97100000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"P1 Trabajador"}'::jsonb);
update public.profiles set role = 'employer' where id = '97100000-0000-4000-8000-000000000001';
update public.profiles set role = 'employer' where id = '97100000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin'    where id = '97100000-0000-4000-8000-000000000003';
update public.profiles set role = 'worker'   where id = '97100000-0000-4000-8000-000000000004';

-- ------------------------------------------------------------
-- Fixtures: cuatro jobs de Empleador A, uno por cada estado real.
-- ------------------------------------------------------------
insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status)
values
  ('98100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000001',
   'P1 Job Abierto', 'Job de control, estado abierto.', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('98100000-0000-4000-8000-000000000002', '97100000-0000-4000-8000-000000000001',
   'P1 Job En Progreso', 'Job de control, estado en_progreso.', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('98100000-0000-4000-8000-000000000003', '97100000-0000-4000-8000-000000000001',
   'P1 Job Completado', 'Job objetivo: tiene rating/application/chat/history/report.', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('98100000-0000-4000-8000-000000000004', '97100000-0000-4000-8000-000000000001',
   'P1 Job Cancelado', 'Job de control, estado cancelado.', 'Otro', 'Lima', 'fijo', 'abierto');

-- Se llevan "en_progreso"/"completado"/"cancelado" con UPDATE directo
-- (superusuario) en vez de vía trigger/Server Action: a esta prueba solo
-- le importa el estado final de `jobs.status`, no cómo se llegó ahí (esa
-- cascada de aceptación ya está cubierta por las pruebas de V2/V3/0002).
update public.jobs set status = 'en_progreso', assigned_worker_id = '97100000-0000-4000-8000-000000000004'
  where id = '98100000-0000-4000-8000-000000000002';
update public.jobs set status = 'completado', assigned_worker_id = '97100000-0000-4000-8000-000000000004'
  where id = '98100000-0000-4000-8000-000000000003';
update public.jobs set status = 'cancelado'
  where id = '98100000-0000-4000-8000-000000000004';

-- ------------------------------------------------------------
-- Historial completo colgado del Job Completado: application aceptada,
-- rating real, conversación + mensaje, job_state_history, y un reporte
-- (para confirmar que 0031 sigue intacto, no que esta migración lo
-- proteja — ya estaba protegido).
-- ------------------------------------------------------------
insert into public.job_applications (id, job_id, worker_id, status)
values ('98200000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000003',
        '97100000-0000-4000-8000-000000000004', 'aceptado');

insert into public.ratings (id, job_id, rater_id, rated_id, score, comment)
values ('98300000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000003',
        '97100000-0000-4000-8000-000000000004', '97100000-0000-4000-8000-000000000001',
        2, 'PRESERVED: calificación real del trabajador al empleador');

insert into public.conversations (id, job_id, employer_id, worker_id)
values ('98400000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000003',
        '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000004');

insert into public.messages (id, conversation_id, sender_id, body)
values ('98500000-0000-4000-8000-000000000001', '98400000-0000-4000-8000-000000000001',
        '97100000-0000-4000-8000-000000000004', 'PRESERVED: mensaje real del chat');

insert into public.job_state_history (id, job_id, actor_id, prev_status, new_status, notes)
values ('98600000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000003',
        '97100000-0000-4000-8000-000000000001', 'en_progreso', 'completado', 'PRESERVED: historial de auditoría');

insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('98700000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000004',
        'job', '98100000-0000-4000-8000-000000000003', 'other',
        'PRESERVED: reporte activo contra el job completado (ya protegido por 0031)', 'pending');

-- Snapshot de integridad ANTES de cualquier intento de borrado.
select
  (select count(*) from public.jobs where id = '98100000-0000-4000-8000-000000000003') as job_existe,
  (select count(*) from public.job_applications where job_id = '98100000-0000-4000-8000-000000000003') as application_existe,
  (select count(*) from public.ratings where job_id = '98100000-0000-4000-8000-000000000003') as rating_existe,
  (select count(*) from public.conversations where job_id = '98100000-0000-4000-8000-000000000003') as conversation_existe,
  (select count(*) from public.messages where conversation_id = '98400000-0000-4000-8000-000000000001') as messages_existen,
  (select count(*) from public.job_state_history where job_id = '98100000-0000-4000-8000-000000000003') as history_existe,
  (select count(*) from public.reports where reported_job_id = '98100000-0000-4000-8000-000000000003') as report_existe;
-- Todos deben ser 1.

-- ============================================================
-- A: Empleador A elimina su propio job ABIERTO — PERMITIDO (comportamiento
--    legítimo actual, sin cambios: sigue siendo un estado no terminal).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000001';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000001';
reset role;
select count(*) as A_debe_ser_cero from public.jobs where id = '98100000-0000-4000-8000-000000000001';

-- ============================================================
-- B: Empleador A elimina su propio job EN_PROGRESO — PERMITIDO (mismo
--    criterio que jobs_update_owner_or_admin: abierto|en_progreso siguen
--    siendo estados no terminales, sin cambios de comportamiento).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000001';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000002';
reset role;
select count(*) as B_debe_ser_cero from public.jobs where id = '98100000-0000-4000-8000-000000000002';

-- ============================================================
-- C: Empleador A intenta eliminar su propio job COMPLETADO (con rating +
--    application + conversation + message + history + report reales) —
--    RECHAZADO. Directo vía SQL/RLS, sin pasar por deleteJob(): esto es
--    el "Direct API / PostgREST equivalent" del caso H — demuestra que la
--    protección no depende de la Server Action.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000001';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000003';
reset role;

select count(*) as C_debe_seguir_siendo_uno from public.jobs where id = '98100000-0000-4000-8000-000000000003';

-- Integridad post-rechazo: TODAS las filas dependientes deben seguir
-- existiendo, no solo el job.
select
  (select count(*) from public.jobs where id = '98100000-0000-4000-8000-000000000003') as job_existe,
  (select count(*) from public.job_applications where job_id = '98100000-0000-4000-8000-000000000003') as application_existe,
  (select count(*) from public.ratings where job_id = '98100000-0000-4000-8000-000000000003') as rating_existe,
  (select count(*) from public.conversations where job_id = '98100000-0000-4000-8000-000000000003') as conversation_existe,
  (select count(*) from public.messages where conversation_id = '98400000-0000-4000-8000-000000000001') as messages_existen,
  (select count(*) from public.job_state_history where job_id = '98100000-0000-4000-8000-000000000003') as history_existe,
  (select count(*) from public.reports where reported_job_id = '98100000-0000-4000-8000-000000000003') as report_existe;
-- Todos deben seguir siendo 1 (idénticos al snapshot de antes).

-- ============================================================
-- D: Empleador A intenta eliminar su propio job CANCELADO — RECHAZADO.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000001';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000004';
reset role;
select count(*) as D_debe_seguir_siendo_uno from public.jobs where id = '98100000-0000-4000-8000-000000000004';

-- ============================================================
-- E: Admin intenta eliminar el job COMPLETADO ajeno — RECHAZADO (decisión
--    de alcance explícita: el bypass admin también queda restringido para
--    estados terminales; adminUpdateJobStatus() sigue siendo la vía de
--    moderación, sin cambios).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000003';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000003';
reset role;
select count(*) as E_debe_seguir_siendo_uno from public.jobs where id = '98100000-0000-4000-8000-000000000003';

-- ============================================================
-- F: Admin intenta eliminar el job CANCELADO ajeno — RECHAZADO.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000003';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000004';
reset role;
select count(*) as F_debe_seguir_siendo_uno from public.jobs where id = '98100000-0000-4000-8000-000000000004';

-- ============================================================
-- G: Empleador B (no dueño) intenta eliminar un job de Empleador A —
--    RECHAZADO, sin relación con el estado (control de ownership, ya
--    cubierto desde 0001, se re-verifica que esta migración no lo rompe).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000002';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000004';
reset role;
select count(*) as G_debe_seguir_siendo_uno from public.jobs where id = '98100000-0000-4000-8000-000000000004';

-- ============================================================
-- Control positivo final: Admin SÍ puede seguir eliminando un job ajeno
-- en estado NO terminal (bypass admin intacto para abierto/en_progreso —
-- no se le quitó ninguna capacidad que no sea sobre estados terminales).
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status)
values ('98100000-0000-4000-8000-000000000005', '97100000-0000-4000-8000-000000000001',
        'P1 Job Abierto Control Admin', 'Confirma que el admin conserva DELETE sobre estados no terminales.',
        'Otro', 'Lima', 'fijo', 'abierto');

set role authenticated;
set request.jwt.claim.sub = '97100000-0000-4000-8000-000000000003';
delete from public.jobs where id = '98100000-0000-4000-8000-000000000005';
reset role;
select count(*) as control_admin_debe_ser_cero from public.jobs where id = '98100000-0000-4000-8000-000000000005';
