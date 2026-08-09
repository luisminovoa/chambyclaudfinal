-- ============================================================
-- Pruebas de regresión — 0027_moderation_action_target_coherence.sql
-- ============================================================
-- Mismo criterio que 0026_report_status_transition_guard.test.sql: el
-- trigger se dispara para cualquier rol que logre pasar
-- moderation_actions_insert_admin (RLS ya exige admin), así que estas
-- pruebas corren directamente como el dueño de la conexión, sin
-- simular auth.uid() — el foco es la coherencia target_user_id/
-- report_id, no la autorización de quién inserta (ya cubierta por
-- reports_security_phase8.sql).
--
-- Cómo ejecutar (contra un Postgres 16 desechable):
--
--   createdb chamby_moderation_coherence
--   psql -d chamby_moderation_coherence -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_moderation_coherence -c "CREATE SCHEMA auth;"
--   psql -d chamby_moderation_coherence -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_moderation_coherence -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_moderation_coherence -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_moderation_coherence -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0027, EN ORDEN
--     psql -d chamby_moderation_coherence -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_moderation_coherence -f supabase/tests/0027_moderation_action_target_coherence.test.sql
--
-- Lectura: cada bloque "RECHAZADO" debe terminar en ERROR P0001 con el
-- mensaje `moderation_action_target_mismatch`. Cada "PERMITIDO" debe
-- terminar en INSERT 1.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('92000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase10 Reportante"}'::jsonb),
  ('92000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase10 Reportado Real"}'::jsonb),
  ('92000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"Fase10 Tercero Ajeno"}'::jsonb),
  ('92000000-0000-4000-8000-000000000004', '{"role":"admin","full_name":"Fase10 Admin"}'::jsonb),
  ('92000000-0000-4000-8000-000000000005', '{"role":"employer","full_name":"Fase10 Empleador"}'::jsonb);
update public.profiles set role = 'admin' where id = '92000000-0000-4000-8000-000000000004';

insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000005',
        'Fase10 Oferta Reportable', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

-- Reporte tipo 'user': reported_user_id = Fase10 Reportado Real.
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
        'user', '92000000-0000-4000-8000-000000000002', 'harassment', 'Reporte de usuario Fase 10', 'pending');

-- Reporte tipo 'job': reported_user_id es NULL por diseño (reports_target_matches_type, 0019).
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001',
        'job', '93000000-0000-4000-8000-000000000001', 'spam', 'Reporte de oferta Fase 10', 'pending');

-- ============================================================
-- PERMITIDOS
-- ============================================================

-- P1: target_user_id coincide exactamente con reports.reported_user_id
-- del report_id referenciado (el camino real de recordModerationAction()).
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000002', 'warning_issued');

-- P2: target_user_id = null sobre un reporte de tipo 'job' — caso real
-- de note_added derivado de un reporte sin usuario reportado.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000004',
        null, 'note_added');

-- P3: target_user_id = null y report_id = null — ninguna coherencia que
-- exigir cuando no hay a quién notificar ni atribuir.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values (null, '92000000-0000-4000-8000-000000000004', null, 'no_action');

select count(*) from public.moderation_actions;
-- Debe ser 3.

-- ============================================================
-- RECHAZADOS — el hallazgo original de Fase 10: fabricar una acción de
-- moderación (con notificación real, 0023) contra un usuario sin
-- relación real con el reporte.
-- ============================================================

-- N1: target_user_id set pero report_id = null — no hay ningún reporte
-- que respalde la acción.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values (null, '92000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000003', 'warning_issued');

-- N2: target_user_id NO coincide con el reported_user_id real del
-- report_id referenciado (el ataque central del hallazgo: fabricar una
-- sanción contra un tercero ajeno al reporte real).
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000003', 'temporary_suspension');

-- N3: target_user_id set mientras report_id apunta a un reporte de tipo
-- 'job' (reported_user_id es NULL ahí) — no hay ningún usuario real que
-- coincida.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000003', 'permanent_block');

-- N4: report_id sintácticamente válido pero que no corresponde a NINGÚN
-- reporte real (ni siquiera de tipo 'job') — el SELECT del trigger no
-- encuentra fila, v_reported_user_id queda NULL, y se rechaza por la
-- misma rama que un mismatch real (antes de que la FK de report_id
-- llegue a evaluarse, ya que el trigger BEFORE INSERT corre primero).
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('94000000-0000-4000-8000-000000000099', '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000003', 'warning_issued');
-- NOTA: si la FK de report_id llegara a evaluarse antes (no es el caso
-- esperado, ver comentario arriba), este INSERT igual terminaría en
-- ERROR — solo que sería foreign_key_violation en vez de
-- moderation_action_target_mismatch. De cualquier forma, el resultado
-- correcto es SIEMPRE rechazo — eso es lo que esta prueba confirma.

select count(*) from public.moderation_actions;
-- Debe seguir siendo 3 — ninguno de los 4 rechazos anteriores insertó fila.

-- Confirmación explícita de que el usuario ajeno (92...0003) nunca
-- recibió ninguna fila de moderation_actions atribuida a él por error.
select count(*) from public.moderation_actions
where target_user_id = '92000000-0000-4000-8000-000000000003';
-- Debe ser 0.
