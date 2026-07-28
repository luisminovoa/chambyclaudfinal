-- ============================================================
-- CHAMBY — Centro de Notificaciones (Fase 3)
-- Tabla de notificaciones unificada para web, mobile, push,
-- email y WhatsApp. Sin migraciones destructivas.
-- Aplicar en Supabase SQL Editor antes de deployar.
-- ============================================================

-- ------------------------------------------------------------
-- Tabla principal de notificaciones
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  type            text        not null,
  -- 'new_application' | 'application_accepted' | 'application_rejected'
  -- 'new_message' | 'job_started' | 'job_completed'
  -- 'new_rating' | 'reminder' | 'system' | 'admin_alert'
  title           text        not null,
  body            text        not null,
  data            jsonb       not null default '{}',
  is_read         boolean     not null default false,
  read_at         timestamptz,
  priority        text        not null default 'normal',
  -- 'low' | 'normal' | 'high' | 'urgent'
  channel         text        not null default 'in_app',
  -- 'in_app' | 'push' | 'email' | 'whatsapp' | 'sms'
  sender_id       uuid        references public.profiles(id) on delete set null,
  job_id          uuid        references public.jobs(id) on delete set null,
  conversation_id uuid        references public.conversations(id) on delete set null,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Índices de rendimiento
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where is_read = false;

-- ------------------------------------------------------------
-- Preferencias de notificación por usuario y canal
-- ------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id      uuid    primary key references public.profiles(id) on delete cascade,
  in_app       boolean not null default true,
  push         boolean not null default true,
  email        boolean not null default true,
  sms          boolean not null default false,
  whatsapp     boolean not null default false,
  types_muted  text[]  not null default '{}',
  quiet_from   time,
  quiet_to     time,
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS: notifications
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

-- INSERT solo permitido a service role (via triggers security definer y server actions)
-- No hay política INSERT para authenticated: evita que usuarios creen notificaciones propias.

-- ------------------------------------------------------------
-- RLS: notification_preferences
-- ------------------------------------------------------------
alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_select_own" on public.notification_preferences;
create policy "notif_prefs_select_own"
  on public.notification_preferences for select
  using (user_id = auth.uid());

drop policy if exists "notif_prefs_upsert_own" on public.notification_preferences;
create policy "notif_prefs_upsert_own"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "notif_prefs_update_own" on public.notification_preferences;
create policy "notif_prefs_update_own"
  on public.notification_preferences for update
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Trigger: nueva postulación → notificar al employer
-- ------------------------------------------------------------
create or replace function public.notify_new_application()
returns trigger as $$
declare v_job record;
begin
  select employer_id, title into v_job from public.jobs where id = new.job_id;
  insert into public.notifications
    (user_id, type, title, body, data, priority, sender_id, job_id)
  values (
    v_job.employer_id,
    'new_application',
    'Nueva postulación recibida',
    'Alguien postuló a tu trabajo "' || v_job.title || '"',
    jsonb_build_object('applicationId', new.id, 'jobId', new.job_id),
    'normal',
    new.worker_id,
    new.job_id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_new_application on public.job_applications;
create trigger on_new_application
  after insert on public.job_applications
  for each row execute function public.notify_new_application();

-- ------------------------------------------------------------
-- Trigger: cambio de estado en postulación
-- accepted → notificar worker | rejected (manual) → notificar worker
-- ------------------------------------------------------------
create or replace function public.notify_application_status_changed()
returns trigger as $$
declare v_job record;
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    select title into v_job from public.jobs where id = new.job_id;
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.worker_id,
      'application_accepted',
      '¡Tu postulación fue aceptada!',
      'Fuiste seleccionado para "' || v_job.title || '". Se abrió el chat.',
      jsonb_build_object('jobId', new.job_id, 'applicationId', new.id),
      'high',
      new.job_id
    );

  elsif new.status = 'rechazado' and (old.status = 'pendiente') then
    -- Solo notificar rechazo manual (no el auto-rechazo masivo al aceptar otro)
    if not exists (
      select 1 from public.job_applications
      where job_id = new.job_id and status = 'aceptado' and id <> new.id
    ) then
      select title into v_job from public.jobs where id = new.job_id;
      insert into public.notifications
        (user_id, type, title, body, data, priority, job_id)
      values (
        new.worker_id,
        'application_rejected',
        'Tu postulación no fue seleccionada',
        'El empleador eligió a otro trabajador para "' || v_job.title || '".',
        jsonb_build_object('jobId', new.job_id, 'applicationId', new.id),
        'low',
        new.job_id
      );
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_application_status_changed on public.job_applications;
create trigger on_application_status_changed
  after update on public.job_applications
  for each row execute function public.notify_application_status_changed();

-- ------------------------------------------------------------
-- Trigger: nuevo mensaje → notificar al otro participante
-- ------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger as $$
declare v_conv record; v_recipient uuid; v_sender_name text;
begin
  select employer_id, worker_id into v_conv
    from public.conversations where id = new.conversation_id;

  v_recipient := case
    when new.sender_id = v_conv.employer_id then v_conv.worker_id
    else v_conv.employer_id
  end;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications
    (user_id, type, title, body, data, priority, sender_id, conversation_id)
  values (
    v_recipient,
    'new_message',
    v_sender_name || ' te envió un mensaje',
    substring(new.body from 1 for 120),
    jsonb_build_object('conversationId', new.conversation_id, 'messageId', new.id),
    'normal',
    new.sender_id,
    new.conversation_id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_new_message_notification on public.messages;
create trigger on_new_message_notification
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ------------------------------------------------------------
-- Trigger: trabajo finalizado → notificar al worker
-- ------------------------------------------------------------
create or replace function public.notify_job_status_changed()
returns trigger as $$
begin
  if new.status = 'completado' and (old.status is distinct from 'completado')
     and new.assigned_worker_id is not null then
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.assigned_worker_id,
      'job_completed',
      'Trabajo finalizado',
      'Tu trabajo "' || new.title || '" fue marcado como completado.',
      jsonb_build_object('jobId', new.id),
      'normal',
      new.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_job_status_changed_notification on public.jobs;
create trigger on_job_status_changed_notification
  after update on public.jobs
  for each row execute function public.notify_job_status_changed();

-- ------------------------------------------------------------
-- Trigger: nueva calificación → notificar al calificado
-- ------------------------------------------------------------
create or replace function public.notify_new_rating()
returns trigger as $$
declare v_rater_name text;
begin
  select full_name into v_rater_name from public.profiles where id = new.rater_id;
  insert into public.notifications
    (user_id, type, title, body, data, priority, sender_id, job_id)
  values (
    new.rated_id,
    'new_rating',
    'Recibiste una calificación',
    v_rater_name || ' te calificó con ' || new.score || ' estrella' ||
      case when new.score = 1 then '' else 's' end,
    jsonb_build_object('jobId', new.job_id, 'score', new.score, 'ratingId', new.id),
    'normal',
    new.rater_id,
    new.job_id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_new_rating_notification on public.ratings;
create trigger on_new_rating_notification
  after insert on public.ratings
  for each row execute function public.notify_new_rating();

-- ------------------------------------------------------------
-- Limpieza automática: notificaciones > 90 días (cron externo)
-- Script SQL de referencia para ejecutar como tarea programada:
-- DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
-- ------------------------------------------------------------
