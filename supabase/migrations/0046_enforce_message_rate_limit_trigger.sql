-- ============================================================
-- CHAMBY — SEC-003: rate limit de mensajes dependiente únicamente de
-- la Server Action — garantía atómica a nivel de base de datos.
--
-- Hallazgo (auditoría SEC-003, clasificado CONFIRMED / LOW): la única
-- barrera que impide superar 30 mensajes por sender por conversación
-- cada 60 segundos era check_message_rate_limit() (0003, endurecida en
-- 0045 tras SEC-001), invocada exclusivamente desde
-- src/lib/actions/chat.ts ANTES del INSERT, en una transacción HTTP
-- separada. messages_insert_participant (0002_hiring_tracking.sql) solo
-- exige `sender_id = auth.uid()` y participación real en la
-- conversación — nunca evalúa el historial reciente de mensajes. Esto
-- deja dos problemas independientes:
--
--   1. Bypass directo: un usuario autenticado puede insertar en
--      public.messages vía PostgREST/supabase-js sin pasar por
--      chat.ts, evitando por completo check_message_rate_limit().
--
--   2. Condición de carrera (existe incluso pasando por chat.ts): el
--      chequeo (SELECT count(*)) y el INSERT posterior ocurren en dos
--      pasos separados sin ningún lock entre ambos. Dos requests
--      concurrentes del mismo sender en la misma conversación pueden
--      ambos leer 29 mensajes (<30), ambos pasar, y ambos insertar —
--      31 mensajes en la ventana. Una policy RLS con subquery en
--      messages_insert_participant NO resuelve esto: un WITH CHECK no
--      puede tomar row locks ni serializar transacciones concurrentes,
--      cada evaluación corre contra su propio snapshot MVCC.
--
-- SOLUCIÓN — mismo patrón ya diseñado, auditado y aplicado en este
-- repositorio para un problema estructuralmente idéntico
-- (0024_report_evidence_limit_trigger.sql, hallazgo F6-01: límite de 5
-- evidencias por reporte). Un trigger BEFORE INSERT serializa por
-- (sender_id, conversation_id) usando un advisory lock transaccional
-- (pg_advisory_xact_lock) antes de contar — el segundo INSERT
-- concurrente espera a que el primero libere el lock (commit/rollback
-- automático al final de su transacción) y entonces cuenta ya viendo
-- la fila que el primero insertó.
--
-- NAMESPACE DEL ADVISORY LOCK: se usa 947300, deliberadamente distinto
-- de 947261 (el namespace ya usado por
-- enforce_report_evidence_limit(), 0024) para que ambos mecanismos no
-- compartan ni puedan colisionar en el mismo espacio de claves de
-- pg_advisory_xact_lock — son invariantes independientes sobre tablas
-- distintas y no deben bloquearse entre sí bajo ninguna circunstancia.
--
-- CLAVE DEL LOCK: hashtext(sender_id || ':' || conversation_id) — dos
-- mensajes del MISMO sender en la MISMA conversación se serializan;
-- el mismo sender en OTRA conversación, o OTRO sender en la misma
-- conversación, obtienen una clave de hash distinta y no se bloquean
-- entre sí (namespaced correctamente por el par completo, no solo por
-- uno de los dos IDs).
--
-- LÍMITE: se reutilizan los mismos valores que check_message_rate_limit()
-- (0003/0045) — 30 mensajes / 60 segundos — para no crear una segunda
-- fuente de verdad divergente. No se centralizan en una única
-- constante SQL compartida (p. ej. una función auxiliar) para mantener
-- este cambio pequeño y aislado; ambos mecanismos seguirán debiendo
-- actualizarse juntos si el límite de negocio cambia en el futuro,
-- exactamente como ya ocurre hoy entre chat.ts y check_message_rate_limit().
--
-- CAPAS RESULTANTES (ninguna reemplaza a la otra):
--   chat.ts → check_message_rate_limit()  : fail-fast, UX (mensaje de
--     error amigable ANTES de intentar el INSERT, evita una petición
--     de red innecesaria cuando ya se sabe que fallará)
--   messages_insert_participant (RLS)      : ownership/participante,
--     sin cambios
--   este trigger BEFORE INSERT             : garantía real, independiente
--     de qué cliente o camino se use para insertar
--
-- INTERACCIÓN CON OTROS TRIGGERS/REALTIME/NOTIFICATIONS: no existe hoy
-- ningún otro trigger BEFORE INSERT sobre public.messages (grep
-- exhaustivo de 0001-0045: el único trigger existente sobre messages es
-- on_new_message_notification, AFTER INSERT, 0004_notifications.sql).
-- Si este trigger permite el INSERT, on_new_message_notification se
-- dispara exactamente igual que hoy. Si este trigger aborta el INSERT
-- (límite excedido), la fila nunca se compromete: on_new_message_notification
-- nunca se ejecuta (correcto — no debe notificarse un mensaje que nunca
-- existió) y Realtime (public.messages está en supabase_realtime desde
-- 0039_enable_realtime_messages.sql) tampoco emite ningún evento, porque
-- solo emite sobre filas efectivamente comprometidas. attachment_url ya
-- llega resuelto como valor de columna del propio INSERT (el archivo se
-- sube a Storage en un paso previo y desacoplado) — este trigger no
-- interactúa con Storage en absoluto.
--
-- ÍNDICES: no se crea ningún índice nuevo en esta migración.
-- idx_messages_conversation (conversation_id, created_at), ya existente
-- desde 0002_hiring_tracking.sql, acota la búsqueda a un rango angosto
-- (como mucho ~30 filas relevantes por ventana de 60s, incluso en una
-- conversación con mucho historial) antes de filtrar por sender_id; dado
-- que cada conversación en Chamby es estrictamente 1:1
-- (employer_id/worker_id, 0002), ese filtro final recorre como máximo
-- unas pocas filas. Un índice compuesto (conversation_id, sender_id,
-- created_at) sería marginalmente más preciso pero no está justificado
-- por el volumen actual — se documenta aquí como opción a reevaluar si
-- el volumen de mensajería crece significativamente, sin crearlo ahora.
--
-- ROLLBACK (no destructivo, no aplicado en esta fase — sin acceso live
-- a Supabase confirmado, mismo estado que SEC-002):
--   drop trigger if exists trg_enforce_message_rate_limit on public.messages;
--   drop function if exists public.enforce_message_rate_limit();
-- Ninguna fila existente de `messages` se modifica ni se revalida — un
-- trigger BEFORE INSERT solo afecta INSERT futuros.
--
-- No se modifica messages_insert_participant, check_message_rate_limit(),
-- 0003, 0024, 0045 ni ninguna otra migración histórica. No se modifica
-- chat.ts: su manejo de errores de INSERT ya es genérico
-- (`if (error) return { error: "No se pudo enviar el mensaje." }`), así
-- que la nueva excepción de este trigger cae naturalmente en ese mismo
-- camino sin requerir ningún cambio de código.
--
-- CORRECCIÓN (revisión independiente de PR #42, antes del primer merge —
-- 0046 nunca estuvo aplicada en ningún entorno, se corrige este mismo
-- archivo en vez de encadenar 0047): ni esta función ni
-- check_message_rate_limit() (0003/0045) forzaban `created_at` a un valor
-- del servidor. messages.created_at (0002/0003) solo tiene
-- `default now()` — sin ningún GRANT/REVOKE de columna sobre
-- public.messages en todo el esquema — así que un INSERT directo vía
-- PostgREST/supabase-js podía especificar cualquier `created_at`
-- explícito. Verificado empíricamente: un sender pudo insertar 40
-- mensajes consecutivos con `created_at = '2020-01-01'` sin ser
-- rechazado nunca, porque cada fila backdateada nunca satisface
-- `created_at > now() - interval '60 seconds'` en los conteos
-- siguientes — el límite de 30/60s quedaba completamente sin efecto,
-- tanto con fecha antigua como con fecha futura (por la misma razón:
-- una fila con created_at en el futuro tampoco es "reciente" respecto
-- al `now()` real en el momento de cada conteo posterior).
--
-- Fix: `new.created_at := now();` como primera línea del cuerpo del
-- trigger, ANTES de cualquier otra cosa — sobreescribe incondicionalmente
-- cualquier valor que el cliente haya intentado enviar (o la ausencia de
-- uno) con la hora real de PostgreSQL en el momento del INSERT. A partir
-- de ahí, el conteo de "mensajes recientes" ya solo puede reflejar
-- tiempos generados por el propio servidor — ni backdating ni
-- future-dating alteran la ventana del rate limit. No cambia el límite
-- (30/60s), el namespace del advisory lock (947300), la clave
-- (sender_id + conversation_id), ni ninguna otra columna.
-- ============================================================

create or replace function public.enforce_message_rate_limit()
returns trigger as $$
declare
  v_count int;
begin
  -- Fuente de tiempo confiable: PostgreSQL server time, nunca el valor
  -- que el cliente haya podido incluir en el INSERT (created_at no tiene
  -- ningún GRANT/REVOKE de columna que se lo impida). Debe ejecutarse
  -- ANTES del conteo — de lo contrario el conteo seguiría pudiendo ver
  -- filas backdateadas/future-dated de intentos anteriores del mismo
  -- sender que ya hubieran sido "corregidas" tarde.
  new.created_at := now();

  -- Validar inputs primero: si sender_id/conversation_id llegaran NULL
  -- (el INSERT de todos modos fallará después por el NOT NULL de la
  -- tabla, 0002_hiring_tracking.sql), no tiene sentido intentar un
  -- advisory lock con una clave NULL — se deja pasar y que la
  -- constraint de la tabla produzca el error estándar de Postgres.
  if new.sender_id is null or new.conversation_id is null then
    return new;
  end if;

  -- Advisory lock transaccional ANTES de contar (orden crítico): se
  -- libera automáticamente al terminar esta transacción (commit o
  -- rollback), sin necesidad de un unlock explícito. Un segundo INSERT
  -- concurrente con la misma clave espera aquí hasta que el primero
  -- termine, y entonces cuenta ya viendo la fila que el primero pudo
  -- haber insertado.
  perform pg_advisory_xact_lock(947300, hashtext(new.sender_id::text || ':' || new.conversation_id::text));

  select count(*) into v_count
  from public.messages
  where sender_id = new.sender_id
    and conversation_id = new.conversation_id
    and created_at > now() - interval '60 seconds';

  if v_count >= 30 then
    raise exception 'message_rate_limit_exceeded: máximo 30 mensajes por conversación cada 60 segundos'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_message_rate_limit on public.messages;
create trigger trg_enforce_message_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();
