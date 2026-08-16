-- ============================================================
-- Pruebas de regresión — 0031_reports_survive_job_deletion.sql
-- ============================================================
-- Igual que 0028 (RLS dependiente de auth.uid()): se simula la sesión
-- con `set role authenticated; set request.jwt.claim.sub = '<uuid>'`.
-- Los casos B-E que verifican el efecto del ON DELETE SET NULL se
-- ejecutan como el propio empleador dueño del job (mismo camino real
-- que deleteJob(), src/lib/actions/jobs.ts, vía jobs_delete_owner_or_admin).
--
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real):
--
--   createdb chamby_job_deletion_guard
--   psql -d chamby_job_deletion_guard -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_job_deletion_guard -c "CREATE SCHEMA auth;"
--   psql -d chamby_job_deletion_guard -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_job_deletion_guard -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_job_deletion_guard -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_job_deletion_guard -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0031, EN ORDEN
--     psql -d chamby_job_deletion_guard -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_job_deletion_guard -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   psql -d chamby_job_deletion_guard -c "revoke update on public.reports from authenticated; grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at) on public.reports to authenticated;"
--   psql -d chamby_job_deletion_guard -f supabase/tests/0031_reports_survive_job_deletion.test.sql
--
-- Nota sobre el GRANT ALL de la línea de arriba: es necesario para que
-- `authenticated` pueda ejecutar el DELETE de jobs (caso B) y el resto de
-- operaciones no cubiertas por columnas específicas — se aplica DESPUÉS
-- de las migraciones, igual que en el runbook de 0009, y luego se
-- reduce el UPDATE de `reports` a las mismas columnas que en producción
-- (línea siguiente), para que los casos F (RECHAZADO) sigan probando la
-- restricción real y no un GRANT ALL residual.
--
-- Lectura: "RECHAZADO" debe terminar en ERROR (CHECK/RLS deniega), o en
-- "UPDATE 0"/"INSERT 0" si Postgres excluye la fila en vez de abortar
-- (mismo criterio que 0008/0014/0028 para casos equivalentes).
-- "PERMITIDO" debe completarse sin error y el SELECT final debe mostrar
-- el estado esperado.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('97000000-0000-4000-8000-000000000001', '{"role":"employer","full_name":"Fase13 Empleador Reportado"}'::jsonb),
  ('97000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase13 Reportante"}'::jsonb),
  ('97000000-0000-4000-8000-000000000003', '{"role":"admin","full_name":"Fase13 Admin"}'::jsonb),
  ('97000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"Fase13 Reportante Ajeno"}'::jsonb);
update public.profiles set role = 'admin' where id = '97000000-0000-4000-8000-000000000003';
update public.profiles set role = 'employer' where id = '97000000-0000-4000-8000-000000000001';

-- Job "objetivo" — el que va a ser reportado y luego borrado por su
-- propio dueño, exactamente el vector descrito en el hallazgo.
insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status)
values (
  '98000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  'Fase13 Job Reportado',
  'Job usado para probar que el reporte sobrevive a su borrado.',
  'Otro',
  'Lima',
  'fijo',
  'abierto'
);

-- ============================================================
-- A: no se puede crear DIRECTAMENTE un reporte target_type='job' con
--    reported_job_id = null — ni siquiera contra un job que sí existe,
--    y mucho menos como intento de fabricar el estado "histórico" desde
--    cero. Debe terminar en ERROR (RLS deniega el INSERT).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values (
  '99000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000002',
  'job',
  null,
  'suspicious_terms',
  'RECHAZADO: intento directo de crear un reporte de job con reported_job_id null',
  'pending'
);
reset role;

select count(*) as debe_ser_cero
from public.reports where id = '99000000-0000-4000-8000-000000000001';

-- ============================================================
-- Fixture para B-E: un reporte real, creado por el camino normal
-- (submitReport(), reported_job_id not null), con evidencia adjunta y
-- una acción de moderación ya registrada sobre ese reporte.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values (
  '99000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000002',
  'job',
  '98000000-0000-4000-8000-000000000001',
  'suspicious_terms',
  'PERMITIDO: reporte real de oferta, creado por el camino normal',
  'pending'
);

insert into public.report_evidence (id, report_id, storage_path, file_name, content_type, uploaded_by)
values (
  '9a000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000002/99000000-0000-4000-8000-000000000002/evidencia.jpg',
  'evidencia.jpg',
  'image/jpeg',
  '97000000-0000-4000-8000-000000000002'
);
reset role;

-- El admin toma el reporte y deja registrada una nota de moderación,
-- igual que recordModerationAction() (admin-reports.ts). target_user_id
-- va en null a propósito: el reporte es de tipo 'job' (reported_user_id
-- es null por reports_target_matches_type, 0019), y
-- trg_moderation_action_target_coherence (0027) exige que, si
-- target_user_id no es null, coincida exactamente con el
-- reported_user_id del report_id referenciado — sobre un reporte de
-- job, la única forma coherente de asociar una nota es con
-- target_user_id = null (mismo caso que el propio comentario de 0027
-- documenta explícitamente: "note_added sobre un reporte de tipo job,
-- donde reported_user_id es legítimamente nulo"). Con
-- target_user_id = '97...0001' (el empleador) este INSERT violaba el
-- trigger y nunca llegaba a insertarse — la fila que el escenario E
-- necesita para probar supervivencia no era otra que esta.
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000003';
update public.reports
  set status = 'under_review', reviewed_by = '97000000-0000-4000-8000-000000000003', reviewed_at = now(), updated_at = now()
  where id = '99000000-0000-4000-8000-000000000002';

insert into public.moderation_actions (id, report_id, admin_id, target_user_id, action_type, reason)
values (
  '9b000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000003',
  null,
  'note_added',
  'PERMITIDO: nota de moderación asociada al reporte antes del borrado del job'
);
reset role;

-- ============================================================
-- F: un usuario normal (ni el reportante ni admin, y ni siquiera el
--    reportante con el candado de columnas) NO puede modificar
--    reported_job_id de un reporte existente para manipular el estado
--    "histórico" por su cuenta. Debe terminar en ERROR/UPDATE 0 — la
--    columna ni siquiera está en el GRANT de authenticated.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000004';
update public.reports
  set reported_job_id = null
  where id = '99000000-0000-4000-8000-000000000002';
reset role;

-- Aun como admin real, reported_job_id no está en el GRANT de columnas
-- — debe fallar igual (column privilege), no por RLS.
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000003';
update public.reports
  set reported_job_id = null
  where id = '99000000-0000-4000-8000-000000000002';
reset role;

select id, reported_job_id, status
from public.reports where id = '99000000-0000-4000-8000-000000000002';
-- reported_job_id debe seguir siendo el job original (no null) — ningún
-- UPDATE de un rol normal debe haberlo tocado todavía.

-- ============================================================
-- B-E: el propio empleador dueño del job lo borra (camino real de
-- deleteJob(), vía jobs_delete_owner_or_admin) — el vector de evasión
-- descrito en el hallazgo. Debe completarse sin error (DELETE 1), y el
-- reporte/evidencia/moderation_actions deben sobrevivir.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000001';
delete from public.jobs where id = '98000000-0000-4000-8000-000000000001';
reset role;

-- B: el reporte sobrevive (no desapareció).
-- C: reported_job_id quedó en null.
select id, target_type, reported_job_id, reason, description, reporter_id, status, created_at
from public.reports where id = '99000000-0000-4000-8000-000000000002';
-- Debe devolver EXACTAMENTE 1 fila, con reported_job_id = null,
-- target_type = 'job', y el resto de columnas (reason, description,
-- reporter_id, status, created_at) intactas desde su creación.

-- D: report_evidence sobrevive.
select count(*) as evidencia_sobreviviente
from public.report_evidence where report_id = '99000000-0000-4000-8000-000000000002';
-- Debe devolver 1 (no 0).

-- E: moderation_actions relacionadas no se eliminan.
select count(*) as moderation_actions_sobrevivientes
from public.moderation_actions where report_id = '99000000-0000-4000-8000-000000000002';
-- Debe devolver 1 (no 0), y report_id no debe haberse puesto en null
-- (eso solo ocurre si el REPORTE se borra, lo cual no pasa aquí — solo
-- el job se borró).

-- ============================================================
-- Control: un reporte NUEVO de job, creado el camino normal DESPUÉS del
-- borrado anterior, contra otro job vivo, sigue funcionando exactamente
-- igual que antes de esta migración (no se relajó el caso normal).
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status)
values (
  '98000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000001',
  'Fase13 Job Control',
  'Job vivo usado solo para confirmar que el INSERT normal sigue exigiendo reported_job_id.',
  'Otro',
  'Lima',
  'fijo',
  'abierto'
);

set role authenticated;
set request.jwt.claim.sub = '97000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values (
  '99000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000002',
  'job',
  '98000000-0000-4000-8000-000000000002',
  'spam',
  'PERMITIDO: reporte normal de job contra un job vivo, camino de siempre',
  'pending'
);
reset role;

select count(*) as debe_ser_uno
from public.reports where id = '99000000-0000-4000-8000-000000000003';
