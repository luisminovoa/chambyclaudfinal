-- ============================================================
-- Pruebas de regresión — 0015_notifications_conversation_id.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real): mismo setup que
-- supabase/tests/0014_multi_role.test.sql, aplicando además
-- 0015_notifications_conversation_id.sql al final.
--
-- P1-P3 deben terminar en éxito. No hay bloques negativos: esta
-- migración solo agrega un backfill de columna, no toca RLS ni
-- privilegios.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('c1000000-0000-0000-0000-000000000001', '{"role":"employer","full_name":"Empleador"}'::jsonb),
  ('c1000000-0000-0000-0000-000000000002', '{"role":"worker","full_name":"Trabajador"}'::jsonb);

insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status)
  values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Chamba con chat', 'desc', 'Limpieza', 'Lima', 'por_hora', 'abierto');

set role authenticated;
set request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000002';
insert into public.job_applications (id, job_id, worker_id)
  values ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-000000000002');
reset role;

-- ============================================================
-- P1: aceptar la postulación crea la conversación (comportamiento
--     preexistente, no debe romperse)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
update public.job_applications set status = 'aceptado'
  where id = 'c3000000-0000-0000-0000-000000000001';
reset role;

select count(*) as conversaciones_creadas from public.conversations
  where job_id = 'c2000000-0000-0000-0000-000000000001';
-- Esperado: 1

-- ============================================================
-- P2: la notificación application_accepted guarda el conversation_id
--     correcto (antes de 0015 quedaba NULL)
-- ============================================================
select n.type, n.conversation_id, c.id as conversation_real
  from public.notifications n
  join public.conversations c on c.job_id = 'c2000000-0000-0000-0000-000000000001'
  where n.type = 'application_accepted'
    and n.user_id = 'c1000000-0000-0000-0000-000000000002';
-- Esperado: n.conversation_id = conversation_real (no NULL, coincide)

-- ============================================================
-- P3: el trabajador (RLS activa) puede leer su propia notificación
--     ya con conversation_id poblado
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000002';
select type, conversation_id is not null as tiene_conversation_id
  from public.notifications
  where user_id = auth.uid() and type = 'application_accepted';
reset role;
-- Esperado: tiene_conversation_id = t
