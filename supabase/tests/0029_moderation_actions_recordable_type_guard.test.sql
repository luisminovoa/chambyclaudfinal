-- ============================================================
-- Pruebas de regresión — 0029_moderation_actions_recordable_type_guard.sql
-- ============================================================
-- CHECK constraint intra-fila — no depende de auth.uid() ni de otra
-- tabla, así que estas pruebas corren directamente como el dueño de la
-- conexión, mismo criterio que 0027_moderation_action_target_coherence.test.sql.
--
-- Cómo ejecutar (contra un Postgres 16 desechable):
--
--   createdb chamby_moderation_type_guard
--   psql -d chamby_moderation_type_guard -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_moderation_type_guard -c "CREATE SCHEMA auth;"
--   psql -d chamby_moderation_type_guard -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_moderation_type_guard -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_moderation_type_guard -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_moderation_type_guard -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0029, EN ORDEN
--     psql -d chamby_moderation_type_guard -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_moderation_type_guard -f supabase/tests/0029_moderation_actions_recordable_type_guard.test.sql
--
-- Lectura: "RECHAZADO" debe terminar en ERROR
-- (new row ... violates check constraint "moderation_actions_recordable_type").
-- "PERMITIDO" debe terminar en INSERT 1.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('97000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase12 Reportante"}'::jsonb),
  ('97000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase12 Reportado"}'::jsonb),
  ('97000000-0000-4000-8000-000000000003', '{"role":"admin","full_name":"Fase12 Admin"}'::jsonb);
update public.profiles set role = 'admin' where id = '97000000-0000-4000-8000-000000000003';

insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001',
        'user', '97000000-0000-4000-8000-000000000002', 'other', 'Reporte Fase 12', 'pending');

-- ============================================================
-- PERMITIDOS — los 5 valores que la aplicación realmente produce hoy
-- (RECORDABLE_ACTION_TYPES + 'status_changed', ver admin-reports.ts)
-- ============================================================

insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'status_changed');
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'note_added');
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'warning_issued');
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'temporary_suspension');
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'permanent_block');

select count(*) from public.moderation_actions;
-- Debe ser 5.

-- ============================================================
-- RECHAZADOS — el hallazgo central de Fase 12: fabricar una entrada de
-- auditoría de un tipo que la aplicación nunca produce.
-- ============================================================

-- N1: 'account_deactivated' — reservado para funcionalidad NO
-- implementada (ver docstring de recordModerationAction()).
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'account_deactivated');

-- N2: 'no_action' — mismo motivo, tampoco está en RECORDABLE_ACTION_TYPES.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'no_action');

select count(*) from public.moderation_actions;
-- Debe seguir siendo 5 — ninguno de los 2 rechazos anteriores insertó fila.
