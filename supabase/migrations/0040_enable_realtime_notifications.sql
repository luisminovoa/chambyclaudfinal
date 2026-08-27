-- ============================================================
-- CHAMBY — Habilita Realtime (postgres_changes) para notifications (Fase C4-G8.5C)
--
-- Causa raíz confirmada en C4-G8.5B: notify_new_message() (0004) sí
-- inserta correctamente en notifications en cada mensaje nuevo (misma
-- transacción que el INSERT en messages, demostrado por la semántica
-- transaccional de triggers de Postgres), y NotificationsProvider ya
-- escucha correctamente esa tabla — pero ninguna migración había
-- agregado nunca `public.notifications` a la publicación
-- `supabase_realtime`, exactamente el mismo patrón de causa raíz ya
-- corregido para `messages`/`conversation_read_cursors` en
-- 0039_enable_realtime_messages.sql. Sin esto, C4-G8.5 (unread en tiempo
-- real vía router.refresh() al recibir "new_message") nunca puede
-- dispararse, aunque su código esté correctamente implementado.
--
-- Alcance mínimo: solo agrega esta tabla a la publicación existente. No
-- toca messages/conversation_read_cursors (ya en la publicación desde
-- 0039), no toca el esquema de notifications, no toca RLS, no toca
-- REPLICA IDENTITY (el valor por defecto alcanza para INSERT, único
-- evento que NotificationsProvider escucha).
-- ============================================================

alter publication supabase_realtime
  add table public.notifications;
