-- ============================================================
-- Pruebas de regresión — 0059_dispatch_reminder_push_trigger.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable con supabase_vault y
-- pg_net disponibles, NUNCA contra el proyecto Supabase real): mismo
-- setup que supabase/tests/0015_notifications_conversation_id.test.sql,
-- aplicando además 0059_dispatch_reminder_push_trigger.sql al final.
--
-- NO ejecutado en esta fase (P1-B2.6) — este entorno de desarrollo no
-- tiene un Postgres local disponible, y ejecutarlo contra Production
-- está explícitamente prohibido. Documentado aquí siguiendo la misma
-- convención que el resto de supabase/tests/*.test.sql (scripts para un
-- Postgres desechable, con el resultado esperado en comentarios) para
-- cuando exista un entorno donde correrlo.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('d1000000-0000-0000-0000-000000000001', '{"role":"worker","full_name":"Trabajador Reminder"}'::jsonb);

-- ============================================================
-- P1: INSERT type='reminder' SIN secretos configurados en Vault →
--     la notification se crea igual (el trigger nunca bloquea el INSERT
--     por falta de configuración).
-- ============================================================
insert into public.notifications (id, user_id, type, title, body, data, priority)
  values (
    'd2000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'reminder',
    'Trabajo próximo',
    'Tu trabajo "Prueba" comienza en 1 hora.',
    '{"jobId":"d3000000-0000-0000-0000-000000000001"}'::jsonb,
    'high'
  );

select count(*) as notification_creada from public.notifications
  where id = 'd2000000-0000-0000-0000-000000000001';
-- Esperado: 1 (la notification existe pese a no haber secretos en Vault)

select count(*) as requests_encolados_p1 from net.http_request_queue;
-- Esperado: 0 (sin secretos configurados, el trigger no llega a llamar
-- a net.http_post — corta antes, dentro de su propio bloque interno)

-- ============================================================
-- Configurar Vault (solo en este Postgres desechable — jamás así en
-- Production, donde esto se hace fuera de cualquier migración) para
-- probar el camino "sí configurado".
-- ============================================================
select vault.create_secret('test-secret-value', 'chamby_push_secret', 'test');
select vault.create_secret('https://example.invalid/functions/v1/send-push', 'chamby_push_function_url', 'test');

-- ============================================================
-- P2: INSERT type='reminder' CON secretos configurados → la notification
--     se crea Y se encola una llamada HTTP asíncrona (net.http_post no
--     espera respuesta — la URL es deliberadamente inválida/inalcanzable
--     y aun así el INSERT debe completar sin error).
-- ============================================================
insert into public.notifications (id, user_id, type, title, body, data, priority)
  values (
    'd2000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000001',
    'reminder',
    'Trabajo próximo',
    'Tu trabajo "Prueba 2" comienza en 1 hora.',
    '{"jobId":"d3000000-0000-0000-0000-000000000002"}'::jsonb,
    'high'
  );

select count(*) as notification_creada_p2 from public.notifications
  where id = 'd2000000-0000-0000-0000-000000000002';
-- Esperado: 1 (creada exitosamente pese a que la URL configurada es
-- inalcanzable — net.http_post solo encola, nunca espera ni bloquea)

select count(*) as requests_encolados_p2 from net.http_request_queue;
-- Esperado: 1 (la única llamada real, correspondiente a P2 — P1 no
-- generó ninguna por falta de configuración)

-- ============================================================
-- P3: el payload encolado contiene ÚNICAMENTE notification_id — nunca
--     title/body/user_id/PII.
-- ============================================================
select body from net.http_request_queue order by id desc limit 1;
-- Esperado: {"notification_id": "d2000000-0000-0000-0000-000000000002"}
-- (ninguna otra clave)

select headers -> 'x-chamby-push-secret' as secret_header from net.http_request_queue order by id desc limit 1;
-- Esperado: "test-secret-value" (el secreto viaja en el header, nunca en el body)

-- ============================================================
-- P4: INSERT de OTRO type → NO dispara ningún despacho.
-- ============================================================
insert into public.notifications (id, user_id, type, title, body, priority)
  values (
    'd2000000-0000-0000-0000-000000000003',
    'd1000000-0000-0000-0000-000000000001',
    'new_message',
    'Nuevo mensaje',
    'Tienes un mensaje nuevo.',
    'normal'
  );

select count(*) as requests_encolados_p4 from net.http_request_queue;
-- Esperado: 1 (sigue igual que tras P2 — este INSERT no agregó ninguno)

-- ============================================================
-- P5: UPDATE de una notification 'reminder' existente → NO dispara el
--     trigger (es AFTER INSERT únicamente).
-- ============================================================
update public.notifications set is_read = true
  where id = 'd2000000-0000-0000-0000-000000000002';

select count(*) as requests_encolados_p5 from net.http_request_queue;
-- Esperado: 1 (sin cambios — el UPDATE no agregó ninguno)

-- ============================================================
-- P6: DELETE de una notification 'reminder' → NO dispara el trigger.
-- ============================================================
delete from public.notifications where id = 'd2000000-0000-0000-0000-000000000003';

select count(*) as requests_encolados_p6 from net.http_request_queue;
-- Esperado: 1 (sin cambios — el DELETE no agregó ninguno)

-- ============================================================
-- P7: el trigger nunca escribe push_dispatched_at (0058) — esa columna
--     es responsabilidad exclusiva de send-push/dispatch.ts, nunca de
--     este trigger.
-- ============================================================
select push_dispatched_at is null as columna_intacta from public.notifications
  where id = 'd2000000-0000-0000-0000-000000000002';
-- Esperado: t (sigue NULL — el trigger solo programa el despacho, no
-- marca nada por su cuenta)
