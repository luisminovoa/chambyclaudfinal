-- ============================================================
-- CHAMBY — Hiring tracking (revisión 4)
-- Columnas de timestamp, audit trail, conversaciones y mensajes.
-- Aplicar en Supabase SQL Editor antes de deployar el código que depende.
-- ============================================================

-- Columnas nuevas en jobs (nullable, retrocompatibles)
alter table public.jobs
  add column if not exists hired_at     timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- ------------------------------------------------------------
-- Audit trail: cada transición de estado registra actor + timestamps
-- ------------------------------------------------------------
create table if not exists public.job_state_history (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id) on delete cascade,
  prev_status job_status,
  new_status  job_status not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_state_history_job
  on public.job_state_history (job_id, created_at desc);

-- ------------------------------------------------------------
-- Conversaciones: una por trabajo, creada al contratar
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null unique references public.jobs(id) on delete cascade,
  employer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Mensajes del chat
-- ------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conversation
  on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- Trigger actualizado: guarda de carrera + hired_at + chat + historial
-- ------------------------------------------------------------
create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_job record;
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    select * into v_job from public.jobs where id = new.job_id for update;
    if v_job.status <> 'abierto' then
      raise exception 'Este trabajo ya no acepta postulantes';
    end if;

    update public.jobs
      set assigned_worker_id = new.worker_id,
          status   = 'en_progreso',
          hired_at = now()
      where id = new.job_id;

    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id
        and id <> new.id
        and status = 'pendiente';

    insert into public.conversations (job_id, employer_id, worker_id)
      values (new.job_id, v_job.employer_id, new.worker_id)
      on conflict (job_id) do nothing;

    insert into public.job_state_history
      (job_id, actor_id, prev_status, new_status, notes)
      values (new.job_id, v_job.employer_id, 'abierto', 'en_progreso',
              'Trabajador aceptado');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- RLS: job_state_history
-- ------------------------------------------------------------
alter table public.job_state_history enable row level security;

drop policy if exists "history_select_participant" on public.job_state_history;
create policy "history_select_participant"
  on public.job_state_history for select
  using (
    job_id in (
      select id from public.jobs
      where employer_id = auth.uid() or assigned_worker_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

drop policy if exists "history_insert_participant" on public.job_state_history;
create policy "history_insert_participant"
  on public.job_state_history for insert
  with check (
    actor_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- ------------------------------------------------------------
-- RLS: conversations
-- ------------------------------------------------------------
alter table public.conversations enable row level security;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  using (
    employer_id = auth.uid()
    or worker_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

drop policy if exists "conversations_insert_employer" on public.conversations;
create policy "conversations_insert_employer"
  on public.conversations for insert
  with check (
    employer_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- ------------------------------------------------------------
-- RLS: messages
-- ------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  using (
    conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
  );
