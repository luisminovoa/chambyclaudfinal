-- ============================================================
-- CHAMBY — Habilita Realtime (postgres_changes) para mensajería (Fase C4-G8.3C)
--
-- Causa raíz confirmada en C4-G8.3A/C4-G8.3B: ninguna migración de este
-- repositorio agregó nunca `messages` ni `conversation_read_cursors` a la
-- publicación `supabase_realtime` — es exactamente por eso que el typing
-- indicator (broadcast, no depende de publicación) funcionaba en tiempo
-- real mientras los mensajes nuevos (postgres_changes, sí depende de
-- publicación) nunca llegaban al receptor sin refrescar la página.
-- Confirmado por el usuario contra Production vía pg_publication_tables:
-- "Success. No rows returned" para ambas tablas.
--
-- Alcance mínimo: solo agrega las dos tablas a la publicación existente.
-- No crea la publicación (ya existe, gestionada por Supabase), no toca
-- REPLICA IDENTITY (el valor por defecto alcanza para INSERT en messages
-- e INSERT/UPDATE en conversation_read_cursors, únicos eventos que
-- consume useChatRealtime.ts hoy), no toca RLS ni ninguna otra tabla.
-- ============================================================

alter publication supabase_realtime
  add table public.messages;

alter publication supabase_realtime
  add table public.conversation_read_cursors;
