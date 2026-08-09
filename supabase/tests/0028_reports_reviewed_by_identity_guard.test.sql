-- ============================================================
-- Pruebas de regresión — 0028_reports_reviewed_by_identity_guard.sql
-- ============================================================
-- A diferencia de 0026/0027 (triggers, disparan para cualquier rol),
-- esta es una policy RLS que depende de auth.uid() — mismo patrón que
-- 0008/0014: se simula la sesión con
-- `set role authenticated; set request.jwt.claim.sub = '<uuid>'`.
--
-- Cómo ejecutar (contra un Postgres 16 desechable):
--
--   createdb chamby_reviewed_by_guard
--   psql -d chamby_reviewed_by_guard -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_reviewed_by_guard -c "CREATE SCHEMA auth;"
--   psql -d chamby_reviewed_by_guard -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_reviewed_by_guard -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_reviewed_by_guard -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_reviewed_by_guard -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0028, EN ORDEN
--     psql -d chamby_reviewed_by_guard -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_reviewed_by_guard -c "revoke update on public.reports from authenticated; grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at) on public.reports to authenticated;"
--   psql -d chamby_reviewed_by_guard -f supabase/tests/0028_reports_reviewed_by_identity_guard.test.sql
--
-- Lectura: "RECHAZADO" debe terminar en ERROR (RLS deniega la
-- actualización — "new row violates row-level security policy"), o en
-- "UPDATE 0" si Postgres evalúa que la fila queda excluida por USING en
-- vez de rechazar por WITH CHECK (ambos casos son un rechazo real,
-- mismo criterio documentado en 0008/0014 para N4). "PERMITIDO" debe
-- terminar en UPDATE 1.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('95000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase11 Reportante"}'::jsonb),
  ('95000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase11 Reportado"}'::jsonb),
  ('95000000-0000-4000-8000-000000000003', '{"role":"admin","full_name":"Fase11 Admin A"}'::jsonb),
  ('95000000-0000-4000-8000-000000000004', '{"role":"admin","full_name":"Fase11 Admin B"}'::jsonb),
  ('95000000-0000-4000-8000-000000000005', '{"role":"worker","full_name":"Fase11 Worker Ajeno"}'::jsonb);
update public.profiles set role = 'admin' where id in (
  '95000000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000004'
);

insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status) values
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'user', '95000000-0000-4000-8000-000000000002', 'other', 'PERMITIDO: admin se atribuye su propia revisión', 'pending'),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001', 'user', '95000000-0000-4000-8000-000000000002', 'other', 'PERMITIDO: reviewed_by = null', 'pending'),
  ('96000000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000001', 'user', '95000000-0000-4000-8000-000000000002', 'other', 'RECHAZADO: Admin A intenta atribuir a Admin B', 'pending'),
  ('96000000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000001', 'user', '95000000-0000-4000-8000-000000000002', 'other', 'RECHAZADO: Admin A intenta atribuir a un worker ajeno', 'pending');

-- ============================================================
-- PERMITIDOS
-- ============================================================

-- P1: Admin A actualiza el reporte atribuyéndose la revisión a sí mismo
-- — el camino real de updateReportStatus() (adminId = auth.uid()).
set role authenticated;
set request.jwt.claim.sub = '95000000-0000-4000-8000-000000000003';
update public.reports
  set status = 'under_review', reviewed_by = '95000000-0000-4000-8000-000000000003', reviewed_at = now(), updated_at = now()
  where id = '96000000-0000-4000-8000-000000000001';
reset role;

select id, reviewed_by from public.reports where id = '96000000-0000-4000-8000-000000000001';
-- reviewed_by debe ser Admin A (95...0003).

-- P2: reviewed_by = null sigue permitido explícitamente (no hay caso
-- real de la app que lo use hoy, pero no es el vector de ataque — ver
-- comentario de la migración).
set role authenticated;
set request.jwt.claim.sub = '95000000-0000-4000-8000-000000000003';
update public.reports
  set status = 'under_review', reviewed_by = null, updated_at = now()
  where id = '96000000-0000-4000-8000-000000000002';
reset role;

select id, reviewed_by from public.reports where id = '96000000-0000-4000-8000-000000000002';
-- reviewed_by debe ser NULL, sin ERROR.

-- ============================================================
-- RECHAZADOS — el hallazgo central de Fase 11: falsificar a qué admin
-- se le atribuye la revisión.
-- ============================================================

-- N1: Admin A intenta atribuir la revisión a Admin B (un admin real,
-- pero que no es quien está ejecutando este UPDATE).
set role authenticated;
set request.jwt.claim.sub = '95000000-0000-4000-8000-000000000003';
update public.reports
  set status = 'under_review', reviewed_by = '95000000-0000-4000-8000-000000000004', updated_at = now()
  where id = '96000000-0000-4000-8000-000000000003';
reset role;

-- N2: Admin A intenta atribuir la revisión a un worker cualquiera (ni
-- siquiera admin) — el caso más claramente incoherente.
set role authenticated;
set request.jwt.claim.sub = '95000000-0000-4000-8000-000000000003';
update public.reports
  set status = 'under_review', reviewed_by = '95000000-0000-4000-8000-000000000005', updated_at = now()
  where id = '96000000-0000-4000-8000-000000000004';
reset role;

select id, reviewed_by, status from public.reports where id in (
  '96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-000000000004'
) order by id;
-- Ambas filas deben seguir con reviewed_by = null y status = 'pending'
-- — ninguno de los dos UPDATE rechazados modificó nada.
