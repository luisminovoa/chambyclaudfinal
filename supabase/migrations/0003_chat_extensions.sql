-- ============================================================
-- CHAMBY — Chat en tiempo real (Fase 2)
-- Extiende messages, agrega cursores, configuraciones y audit log.
-- Aplicar en Supabase SQL Editor antes de deployar.
-- ============================================================

-- Extensión de messages: tipo, adjunto y metadata
alter table public.messages
  add column if not exists type           text not null default 'text',
  -- 'text' | 'image' | 'location' | 'pdf' | 'audio' | 'video'
  add column if not exists attachment_url text,
  add column if not exists metadata       jsonb;
  -- { lat, lng } para location; null para text/image

-- Índices de rendimiento
create index if not exists idx_messages_sender
  on public.messages (sender_id);

create index if not exists idx_messages_unread
  on public.messages (conversation_id, read_at)
  where read_at is null;

create index if not exists idx_conversations_employer
  on public.conversations (employer_id);

create index if not exists idx_conversations_worker
  on public.conversations (worker_id);

-- ------------------------------------------------------------
-- Cursores de lectura: O(1) por usuario por conversación
-- ------------------------------------------------------------
create table if not exists public.conversation_read_cursors (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- ------------------------------------------------------------
-- Configuraciones de conversación: silenciar, archivar, bloquear
-- ------------------------------------------------------------
create table if not exists public.conversation_settings (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  is_muted        boolean not null default false,
  is_archived     boolean not null default false,
  is_blocked      boolean not null default false,
  muted_until     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- ------------------------------------------------------------
-- Audit log de mensajes eliminados por administradores
-- ------------------------------------------------------------
create table if not exists public.message_audit_log (
  id              uuid primary key default uuid_generate_v4(),
  message_id      uuid not null,
  conversation_id uuid not null references public.conversations(id),
  sender_id       uuid not null references public.profiles(id),
  actor_id        uuid not null references public.profiles(id),
  body            text not null,
  type            text not null,
  deleted_at      timestamptz not null default now(),
  reason          text
);

-- ------------------------------------------------------------
-- Rate limiting: máximo 30 mensajes por minuto por usuario por conversación
-- ------------------------------------------------------------
create or replace function public.check_message_rate_limit(
  p_conversation_id uuid,
  p_sender_id       uuid,
  p_window_seconds  int default 60,
  p_max_messages    int default 30
) returns boolean as $$
declare v_count int;
begin
  select count(*) into v_count
  from public.messages
  where conversation_id = p_conversation_id
    and sender_id = p_sender_id
    and created_at > now() - (p_window_seconds || ' seconds')::interval;
  return v_count < p_max_messages;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- RLS: conversation_read_cursors
-- ------------------------------------------------------------
alter table public.conversation_read_cursors enable row level security;

drop policy if exists "cursors_select_participant" on public.conversation_read_cursors;
create policy "cursors_select_participant"
  on public.conversation_read_cursors for select
  using (
    profile_id = auth.uid()
    or conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

drop policy if exists "cursors_insert_own" on public.conversation_read_cursors;
create policy "cursors_insert_own"
  on public.conversation_read_cursors for insert
  with check (profile_id = auth.uid());

drop policy if exists "cursors_update_own" on public.conversation_read_cursors;
create policy "cursors_update_own"
  on public.conversation_read_cursors for update
  using (profile_id = auth.uid());

-- ------------------------------------------------------------
-- RLS: conversation_settings
-- ------------------------------------------------------------
alter table public.conversation_settings enable row level security;

drop policy if exists "settings_select_own" on public.conversation_settings;
create policy "settings_select_own"
  on public.conversation_settings for select
  using (profile_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "settings_insert_own" on public.conversation_settings;
create policy "settings_insert_own"
  on public.conversation_settings for insert
  with check (profile_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "settings_update_own" on public.conversation_settings;
create policy "settings_update_own"
  on public.conversation_settings for update
  using (profile_id = auth.uid() or public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- RLS: message_audit_log (solo admin)
-- ------------------------------------------------------------
alter table public.message_audit_log enable row level security;

drop policy if exists "audit_log_admin_only" on public.message_audit_log;
create policy "audit_log_admin_only"
  on public.message_audit_log for all
  using (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- Supabase Storage: instrucciones de configuración manual
-- Crear bucket "conversation-attachments" en Supabase Dashboard:
--   - Public: NO (privado)
--   - Políticas: authenticated users pueden INSERT en su propio prefix
--   - Max file size: 5 MB
-- ------------------------------------------------------------
