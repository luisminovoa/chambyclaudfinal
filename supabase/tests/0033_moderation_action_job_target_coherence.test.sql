-- ============================================================
-- Pruebas de regresión — 0033_moderation_action_job_target_coherence.sql
-- ============================================================
-- Mismo criterio que 0027_moderation_action_target_coherence.test.sql
-- (que este archivo NO modifica): el trigger se dispara para cualquier
-- rol que logre pasar moderation_actions_insert_admin (RLS ya exige
-- admin), así que estas pruebas corren directamente como el dueño de
-- la conexión, sin simular auth.uid().
--
-- Cubre específicamente lo que 0027 no podía cubrir todavía: la
-- resolución de target_user_id para reportes target_type='job' contra
-- jobs.employer_id, incluido el caso donde la oferta ya fue eliminada
-- (reports_survive_job_deletion, 0031 — reported_job_id queda null,
-- el reporte sobrevive). También confirma que el flujo completo
-- INSERT moderation_actions -> on_moderation_action_inserted (0023) ->
-- notify_moderation_action() -> notifications realmente crea la
-- notificación cuando target_user_id se resuelve correctamente — algo
-- que los tests de Vitest (admin-reports.test.ts) no pueden verificar
-- porque mockean el cliente y nunca ejecutan un trigger real.
--
-- Cómo ejecutar (contra un Postgres 16 desechable):
--
--   createdb chamby_moderation_job_coherence
--   psql -d chamby_moderation_job_coherence -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_moderation_job_coherence -c "CREATE SCHEMA auth;"
--   psql -d chamby_moderation_job_coherence -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_moderation_job_coherence -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_moderation_job_coherence -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_moderation_job_coherence -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0033, EN ORDEN
--     psql -d chamby_moderation_job_coherence -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_moderation_job_coherence -f supabase/tests/0033_moderation_action_job_target_coherence.test.sql
--
-- Lectura: "RECHAZADO" debe terminar en ERROR P0001 con el mensaje
-- `moderation_action_target_mismatch`. "PERMITIDO" debe terminar en
-- INSERT 1.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('9c000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase13 Reportante"}'::jsonb),
  ('9c000000-0000-4000-8000-000000000002', '{"role":"employer","full_name":"Fase13 Empleador Real"}'::jsonb),
  ('9c000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"Fase13 Tercero Ajeno"}'::jsonb),
  ('9c000000-0000-4000-8000-000000000004', '{"role":"admin","full_name":"Fase13 Admin"}'::jsonb);
update public.profiles set role = 'admin' where id = '9c000000-0000-4000-8000-000000000004';
update public.profiles set role = 'employer' where id = '9c000000-0000-4000-8000-000000000002';

-- Job vivo, cuyo dueño real es 9c...0002.
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('9d000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000002',
        'Fase13 Seguridad por horas', 'Descripción de prueba con más de 20 caracteres', 'Seguridad', 'Lima', 'abierto');

-- Reporte target_type='job' contra el job vivo.
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('9e000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000001',
        'job', '9d000000-0000-4000-8000-000000000001', 'suspicious_terms', 'Reporte de oferta Fase 13', 'pending');

-- Reporte target_type='user', para confirmar que la rama original (0027) sigue intacta.
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('9e000000-0000-4000-8000-000000000002', '9c000000-0000-4000-8000-000000000001',
        'user', '9c000000-0000-4000-8000-000000000003', 'harassment', 'Reporte de usuario Fase 13', 'pending');

-- ============================================================
-- PERMITIDOS
-- ============================================================

-- P1 (B/D/E del pedido): target_user_id = jobs.employer_id real de la
-- oferta reportada — el camino real de recordModerationAction() tras el
-- fix de esta fase.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type, reason)
values ('9e000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000004',
        '9c000000-0000-4000-8000-000000000002', 'warning_issued', 'PERMITIDO: employer_id real de la oferta');

-- Confirma el efecto de cadena completo: on_moderation_action_inserted
-- (0023) -> notify_moderation_action() debe haber creado la
-- notificación real para el empleador — esto es lo que Vitest no puede
-- probar (mockea el cliente, nunca ejecuta el trigger).
select count(*) as notificacion_creada
from public.notifications
where user_id = '9c000000-0000-4000-8000-000000000002'
  and type = 'moderation_action'
  and priority = 'high';
-- Debe ser 1.

-- P2: target_type='user' sin cambios — misma cobertura que 0027, aquí
-- solo para confirmar que la redefinición de la función en 0033 no
-- rompió la rama original.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('9e000000-0000-4000-8000-000000000002', '9c000000-0000-4000-8000-000000000004',
        '9c000000-0000-4000-8000-000000000003', 'warning_issued');

select count(*) as notificacion_usuario_creada
from public.notifications
where user_id = '9c000000-0000-4000-8000-000000000003'
  and type = 'moderation_action';
-- Debe ser 1 — confirma que la rama 'user' sigue notificando igual que antes.

-- P3: target_user_id = null sobre el reporte de job — note_added sin
-- destinatario sigue permitido (recordModerationAction() lo permite a
-- propósito para este action_type; el trigger nunca lo exige).
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('9e000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000004',
        null, 'note_added');

select count(*) from public.moderation_actions;
-- Debe ser 3.

-- ============================================================
-- RECHAZADOS
-- ============================================================

-- N1: target_user_id NO coincide con el employer_id real de la oferta
-- reportada (el tercero ajeno, no el dueño real) — mismo tipo de ataque
-- que N2 de 0027, ahora para la rama 'job'.
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('9e000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000004',
        '9c000000-0000-4000-8000-000000000003', 'permanent_block');

-- N2 (el caso central de esta fase, cruce con 0031): se elimina el job
-- reportado — el reporte sobrevive con reported_job_id=null
-- (reports_survive_job_deletion, 0031), pero ya NO existe ningún
-- employer_id contra el cual validar. Un intento de registrar una
-- acción de moderación con CUALQUIER target_user_id no nulo contra este
-- reporte debe rechazarse — no hay forma de que sea coherente.
delete from public.jobs where id = '9d000000-0000-4000-8000-000000000001';

select reported_job_id from public.reports where id = '9e000000-0000-4000-8000-000000000001';
-- Debe ser NULL (confirma que 0031 hizo su trabajo antes de esta prueba).

insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('9e000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000004',
        '9c000000-0000-4000-8000-000000000002', 'warning_issued');
-- RECHAZADO — incluso con el UUID del que SÍ era el empleador real
-- antes del borrado: ya no hay ningún job del cual derivarlo, así que
-- no hay ninguna base para aceptarlo (recordModerationAction(), en el
-- flujo normal de la app, nunca llega a intentar este INSERT — se
-- detiene antes con un error controlado; esta prueba confirma que la
-- base de datos también lo rechazaría si algo se saltara esa capa).

select count(*) from public.moderation_actions;
-- Debe seguir siendo 3 — ninguno de los 2 rechazos anteriores insertó fila.

-- Confirmación explícita: el tercero ajeno (9c...0003) nunca quedó
-- atribuido a NINGUNA acción sobre el reporte de oferta (9e...0001) —
-- la única fila legítima con target_user_id=9c...0003 es la de P2,
-- sobre el reporte de USUARIO (9e...0002), donde sí es el reportado real.
select count(*) from public.moderation_actions
where target_user_id = '9c000000-0000-4000-8000-000000000003'
  and report_id = '9e000000-0000-4000-8000-000000000001';
-- Debe ser 0.
