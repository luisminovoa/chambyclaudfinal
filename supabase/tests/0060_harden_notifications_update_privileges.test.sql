-- ============================================================
-- Pruebas de regresión — 0060_harden_notifications_update_privileges.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable con supabase_vault
-- disponible, NUNCA contra el proyecto Supabase real): mismo setup que
-- supabase/tests/0015_notifications_conversation_id.test.sql, aplicando
-- además 0060_harden_notifications_update_privileges.sql al final. NO
-- requiere que 0059 esté aplicada — deliberadamente, para demostrar que
-- 0060 es independiente y segura de correr sin ella (ver P9 al final).
--
-- NO ejecutado en esta fase (P1-B2.8.1) — este entorno de desarrollo no
-- tiene un Postgres local disponible, y ejecutarlo contra Production
-- está explícitamente prohibido en esta fase. Documentado siguiendo la
-- misma convención que el resto de supabase/tests/*.test.sql.
--
-- Nota de ejecución: los bloques marcados "Esperado: ERROR ..." fallan
-- deliberadamente — en psql sin `-v ON_ERROR_STOP=1`, cada sentencia es
-- su propia transacción implícita, así que un error no aborta el resto
-- del script (mismo comportamiento ya asumido por 0059's test file).
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('e1000000-0000-0000-0000-000000000001', '{"role":"worker","full_name":"Usuario A"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000002', '{"role":"worker","full_name":"Usuario B"}'::jsonb);

insert into public.notifications (id, user_id, type, title, body, priority)
  values (
    'e2000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'reminder',
    'Trabajo próximo',
    'Tu trabajo comienza en 1 hora.',
    'high'
  );

-- ============================================================
-- P1: flujo legítimo — authenticated marca SU PROPIA notification como
--     leída (is_read + read_at), igual que markNotificationRead()
--     (src/lib/actions/notifications.ts).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

update public.notifications set is_read = true, read_at = now()
  where id = 'e2000000-0000-0000-0000-000000000001' and user_id = auth.uid();

reset role;

select is_read, read_at is not null as tiene_read_at from public.notifications
  where id = 'e2000000-0000-0000-0000-000000000001';
-- Esperado: is_read = t, tiene_read_at = t (el flujo legítimo sigue funcionando)

-- ============================================================
-- P2: authenticated NO puede modificar push_dispatched_at — ni siquiera
--     en su PROPIA notification. Debe fallar por PRIVILEGIO (permission
--     denied), no solo quedar sin filas afectadas por RLS.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

update public.notifications set push_dispatched_at = null
  where id = 'e2000000-0000-0000-0000-000000000001' and user_id = auth.uid();
-- Esperado: ERROR: permission denied for column push_dispatched_at (o
-- table, según versión) — un error de PRIVILEGIO, no de RLS.

reset role;

-- ============================================================
-- P3: authenticated NO puede cambiar user_id de su propia notification
--     (protegido por privilegio de columna, redundante con el WITH
--     CHECK implícito de notifications_update_own ya confirmado en
--     P1-B2.5.1 — pero ahora también bloqueado un nivel antes).
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

update public.notifications set user_id = 'e1000000-0000-0000-0000-000000000002'
  where id = 'e2000000-0000-0000-0000-000000000001' and user_id = auth.uid();
-- Esperado: ERROR: permission denied for column user_id

reset role;

select user_id from public.notifications where id = 'e2000000-0000-0000-0000-000000000001';
-- Esperado: e1000000-0000-0000-0000-000000000001 (sin cambios)

-- ============================================================
-- P4: authenticated NO puede modificar columnas fuera del flujo
--     legítimo (type/title/body/priority) — ni siquiera en su propia fila.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

update public.notifications set title = 'Título falsificado'
  where id = 'e2000000-0000-0000-0000-000000000001' and user_id = auth.uid();
-- Esperado: ERROR: permission denied for column title

update public.notifications set type = 'application_accepted'
  where id = 'e2000000-0000-0000-0000-000000000001' and user_id = auth.uid();
-- Esperado: ERROR: permission denied for column type

reset role;

-- ============================================================
-- P5: RLS sigue impidiendo tocar la notification de OTRA cuenta — el
--     usuario B nunca puede afectar la fila del usuario A, ni siquiera
--     sobre las columnas que sí tiene privilegio de escribir.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000002';

update public.notifications set is_read = true, read_at = now()
  where id = 'e2000000-0000-0000-0000-000000000001';

reset role;

select is_read, read_at from public.notifications where id = 'e2000000-0000-0000-0000-000000000001';
-- Esperado: is_read sigue en su valor de P1 (t), read_at sin cambios
-- respecto a P1 — el UPDATE del usuario B no afectó ninguna fila (RLS
-- lo excluyó antes de que el privilegio de columna importara).

-- ============================================================
-- P6: las lecturas de notifications siguen funcionando sin cambios.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

select count(*) as notifications_visibles from public.notifications where user_id = auth.uid();
-- Esperado: 1

reset role;

-- ============================================================
-- P7: service_role conserva capacidad de actualizar push_dispatched_at
--     — necesario para dispatch.ts (send-push) una vez desplegada.
-- ============================================================
set role service_role;

update public.notifications set push_dispatched_at = now()
  where id = 'e2000000-0000-0000-0000-000000000001';

reset role;

select push_dispatched_at is not null as service_role_pudo_marcar from public.notifications
  where id = 'e2000000-0000-0000-0000-000000000001';
-- Esperado: t

-- ============================================================
-- P8: service_role conserva UPDATE de tabla completa (no se le tocó
--     ningún privilegio en esta migración).
-- ============================================================
select has_table_privilege('service_role', 'public.notifications', 'UPDATE') as service_role_update_tabla;
-- Esperado: t

-- ============================================================
-- P9: esta migración no depende de 0059 — este script completo corrió
--     sin que 0059 (pg_net/trigger) estuviera aplicada, demostrando que
--     0060 es segura de aplicar independientemente del orden respecto a
--     0059.
-- ============================================================
select exists(
  select 1 from pg_trigger where tgname = 'trg_dispatch_reminder_push'
) as trigger_0059_presente;
-- Esperado: f (0059 no se aplicó en este script, y aun así P1-P8 pasaron)
