-- ============================================================
-- Pruebas de regresión — 0026_report_status_transition_guard.sql
-- ============================================================
-- A diferencia de 0008/0009/0014/0015 (que prueban RLS y por eso
-- necesitan simular `auth.uid()` vía `set request.jwt.claim.sub`), esta
-- migración es un trigger BEFORE UPDATE que se dispara para CUALQUIER
-- rol — no depende de quién ejecuta el UPDATE, solo de OLD.status/
-- NEW.status. Por eso este archivo corre directamente como el dueño de
-- la conexión (sin `set role authenticated`), y no necesita fixtures de
-- auth.users/profiles con roles distintos — un solo perfil de prueba
-- basta para ejercitar las 16 combinaciones OLD→NEW posibles.
--
-- Cómo ejecutar (contra un Postgres 16 desechable):
--
--   createdb chamby_status_guard
--   psql -d chamby_status_guard -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_status_guard -c "CREATE SCHEMA auth;"
--   psql -d chamby_status_guard -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_status_guard -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_status_guard -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_status_guard -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0026, EN ORDEN
--     psql -d chamby_status_guard -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_status_guard -f supabase/tests/0026_report_status_transition_guard.test.sql
--
-- Lectura de resultados: cada bloque "RECHAZADO" debe terminar en
-- ERROR P0001 con el mensaje `report_status_transition_invalid`. Cada
-- bloque "PERMITIDO" debe terminar con UPDATE 1. El bloque final de
-- "otros campos" debe terminar con UPDATE 1 sin ningún error, con
-- status sin cambios.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('90000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase9 Reportante"}'::jsonb),
  ('90000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase9 Reportado"}'::jsonb),
  ('90000000-0000-4000-8000-000000000003', '{"role":"admin","full_name":"Fase9 Admin"}'::jsonb);
update public.profiles set role = 'admin' where id = '90000000-0000-4000-8000-000000000003';

-- Un reporte fresco por cada combinación OLD→NEW a probar, para no
-- depender del orden de ejecución de los bloques anteriores.
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'pending -> under_review (PERMITIDO)', 'pending'),
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'pending -> dismissed (PERMITIDO)', 'pending'),
  ('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'under_review -> resolved (PERMITIDO)', 'under_review'),
  ('91000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'under_review -> dismissed (PERMITIDO)', 'under_review'),
  ('91000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'pending -> resolved (RECHAZADO)', 'pending'),
  ('91000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'under_review -> pending (RECHAZADO)', 'under_review'),
  ('91000000-0000-4000-8000-000000000007', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'resolved -> pending (RECHAZADO)', 'resolved'),
  ('91000000-0000-4000-8000-000000000008', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'resolved -> under_review (RECHAZADO)', 'resolved'),
  ('91000000-0000-4000-8000-000000000009', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'resolved -> dismissed (RECHAZADO)', 'resolved'),
  ('91000000-0000-4000-8000-000000000010', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'dismissed -> pending (RECHAZADO)', 'dismissed'),
  ('91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'dismissed -> under_review (RECHAZADO)', 'dismissed'),
  ('91000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'dismissed -> resolved (RECHAZADO)', 'dismissed'),
  ('91000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000001', 'user', '90000000-0000-4000-8000-000000000002', 'other', 'pending -> pending, otros campos (PERMITIDO)', 'pending');

-- ============================================================
-- PERMITIDOS (las 4 transiciones oficiales)
-- ============================================================

-- P1: pending -> under_review
update public.reports set status = 'under_review', updated_at = now()
  where id = '91000000-0000-4000-8000-000000000001';

-- P2: pending -> dismissed
update public.reports set status = 'dismissed', updated_at = now()
  where id = '91000000-0000-4000-8000-000000000002';

-- P3: under_review -> resolved
update public.reports set status = 'resolved', updated_at = now()
  where id = '91000000-0000-4000-8000-000000000003';

-- P4: under_review -> dismissed
update public.reports set status = 'dismissed', updated_at = now()
  where id = '91000000-0000-4000-8000-000000000004';

select id, status from public.reports where id in (
  '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000004'
) order by id;
-- Deben mostrar: under_review, dismissed, resolved, dismissed (respectivamente).

-- ============================================================
-- RECHAZADOS (las 12 combinaciones restantes) — cada uno debe terminar
-- en ERROR P0001 report_status_transition_invalid.
-- ============================================================

-- N1: pending -> resolved
update public.reports set status = 'resolved' where id = '91000000-0000-4000-8000-000000000005';

-- N2: under_review -> pending
update public.reports set status = 'pending' where id = '91000000-0000-4000-8000-000000000006';

-- N3: resolved -> pending
update public.reports set status = 'pending' where id = '91000000-0000-4000-8000-000000000007';

-- N4: resolved -> under_review
update public.reports set status = 'under_review' where id = '91000000-0000-4000-8000-000000000008';

-- N5: resolved -> dismissed
update public.reports set status = 'dismissed' where id = '91000000-0000-4000-8000-000000000009';

-- N6: dismissed -> pending
update public.reports set status = 'pending' where id = '91000000-0000-4000-8000-000000000010';

-- N7: dismissed -> under_review
update public.reports set status = 'under_review' where id = '91000000-0000-4000-8000-000000000011';

-- N8: dismissed -> resolved
update public.reports set status = 'resolved' where id = '91000000-0000-4000-8000-000000000012';

-- Confirmación: ninguno de los 8 rechazos anteriores modificó su fila
-- (cada UPDATE fue una transacción implícita de una sola sentencia que
-- Postgres revierte automáticamente al fallar con excepción).
select id, status from public.reports where id in (
  '91000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000006',
  '91000000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000009', '91000000-0000-4000-8000-000000000010',
  '91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000012'
) order by id;
-- Deben mostrar exactamente el status ORIGINAL de cada fixture de
-- arriba (pending/under_review/resolved/resolved/resolved/dismissed/
-- dismissed/dismissed) — ninguno cambió.

-- ============================================================
-- OTROS CAMPOS: un UPDATE que NO cambia `status` (solo admin_notes/
-- reviewed_by/reviewed_at/updated_at) no debe fallar por el trigger,
-- aunque el valor de status escrito sea igual al actual.
-- ============================================================
update public.reports
  set status = 'pending', admin_notes = 'nota sin cambiar el estado',
      reviewed_by = '90000000-0000-4000-8000-000000000003', reviewed_at = now(), updated_at = now()
  where id = '91000000-0000-4000-8000-000000000013';

select id, status, admin_notes from public.reports where id = '91000000-0000-4000-8000-000000000013';
-- Debe mostrar status='pending' (sin cambio) y admin_notes actualizado — sin ERROR.
