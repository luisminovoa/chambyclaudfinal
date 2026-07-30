-- ============================================================
-- CHAMBY — Contratación y trabajo en curso (migración 0011)
-- Tabla job_assignments + soporte multi-vacante en el trigger
-- de aceptación + notificación de preselección.
-- ============================================================

-- ------------------------------------------------------------
-- ENUM: assignment_status
-- ------------------------------------------------------------
do $$ begin
  create type public.assignment_status as enum (
    'asignado', 'confirmado', 'en_progreso', 'completado', 'cancelado'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- TABLA: job_assignments
-- Una fila por trabajador contratado (soporta multi-vacante)
-- ------------------------------------------------------------
create table if not exists public.job_assignments (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  worker_id      uuid not null references public.profiles(id) on delete cascade,
  employer_id    uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.job_applications(id) on delete set null,
  status         public.assignment_status not null default 'asignado',
  agreed_pay     numeric(10,2),
  notes          text,
  confirmed_at   timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (job_id, worker_id)
);

create index if not exists idx_job_assignments_job
  on public.job_assignments (job_id);
create index if not exists idx_job_assignments_worker
  on public.job_assignments (worker_id, created_at desc);
create index if not exists idx_job_assignments_employer
  on public.job_assignments (employer_id, created_at desc);

drop trigger if exists trg_job_assignments_updated_at on public.job_assignments;
create trigger trg_job_assignments_updated_at
  before update on public.job_assignments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: job_assignments
-- Empleador y trabajador ven sus propias asignaciones.
-- Solo el empleador crea; ambos pueden actualizar su asignación
-- (la server action restringe qué transición de estado permite).
-- ------------------------------------------------------------
alter table public.job_assignments enable row level security;

drop policy if exists "assignments_select_participant" on public.job_assignments;
create policy "assignments_select_participant"
  on public.job_assignments for select
  using (
    employer_id = auth.uid()
    or worker_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

drop policy if exists "assignments_insert_employer" on public.job_assignments;
create policy "assignments_insert_employer"
  on public.job_assignments for insert
  with check (
    employer_id = auth.uid()
    and job_id in (select id from public.jobs where employer_id = auth.uid())
  );

drop policy if exists "assignments_update_participant" on public.job_assignments;
create policy "assignments_update_participant"
  on public.job_assignments for update
  using (
    employer_id = auth.uid()
    or worker_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- ------------------------------------------------------------
-- Trigger de aceptación: soporte multi-vacante
-- ------------------------------------------------------------
-- Antes: al aceptar UNA postulación se rechazaban TODAS las demás y
-- el trabajo pasaba a 'en_progreso'. Con positions_needed > 1 eso
-- impedía contratar al resto de vacantes. Ahora el cierre del trabajo
-- y el auto-rechazo solo ocurren cuando se cubren todas las vacantes.
-- ------------------------------------------------------------
create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_job    record;
  v_hired  int;
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    select * into v_job from public.jobs where id = new.job_id for update;

    if v_job.status not in ('abierto', 'en_progreso') then
      raise exception 'Este trabajo ya no acepta postulantes';
    end if;

    select count(*) into v_hired
      from public.job_applications
      where job_id = new.job_id and status = 'aceptado';

    if v_hired > greatest(v_job.positions_needed, 1) then
      raise exception 'No quedan vacantes disponibles en este trabajo';
    end if;

    -- assigned_worker_id conserva al primer contratado (columna legacy
    -- de un solo trabajador); job_assignments es la fuente completa.
    update public.jobs
      set assigned_worker_id = coalesce(assigned_worker_id, new.worker_id),
          hired_at           = coalesce(hired_at, now())
      where id = new.job_id;

    insert into public.conversations (job_id, employer_id, worker_id)
      values (new.job_id, v_job.employer_id, new.worker_id)
      on conflict (job_id) do nothing;

    if v_hired >= greatest(v_job.positions_needed, 1) then
      update public.jobs
        set status = 'en_progreso'
        where id = new.job_id and status <> 'en_progreso';

      update public.job_applications
        set status = 'rechazado'
        where job_id = new.job_id
          and id <> new.id
          and status in ('pendiente', 'preseleccionado');

      if v_job.status <> 'en_progreso' then
        insert into public.job_state_history
          (job_id, actor_id, prev_status, new_status, notes)
          values (new.job_id, v_job.employer_id, v_job.status, 'en_progreso',
                  'Todas las vacantes cubiertas');
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- Notificaciones: preselección + rechazo con el nuevo estado
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

  elsif new.status = 'preseleccionado' and (old.status is distinct from 'preseleccionado') then
    select title into v_job from public.jobs where id = new.job_id;
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.worker_id,
      'application_shortlisted',
      'Fuiste preseleccionado',
      'El empleador te preseleccionó para "' || v_job.title || '".',
      jsonb_build_object('jobId', new.job_id, 'applicationId', new.id),
      'high',
      new.job_id
    );

  elsif new.status = 'rechazado' and old.status in ('pendiente', 'preseleccionado') then
    -- Solo notificar rechazo manual (no el auto-rechazo masivo al cubrir vacantes)
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

-- ------------------------------------------------------------
-- Notificaciones del ciclo de vida de la asignación
-- ------------------------------------------------------------
create or replace function public.notify_assignment_status_changed()
returns trigger as $$
declare
  v_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select title into v_title from public.jobs where id = new.job_id;

  if new.status = 'en_progreso' then
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.worker_id, 'job_started', 'El trabajo comenzó',
      'Se inició "' || v_title || '". ¡Mucho éxito!',
      jsonb_build_object('jobId', new.job_id, 'assignmentId', new.id),
      'normal', new.job_id
    );

  elsif new.status = 'completado' then
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.worker_id, 'job_completed', 'Trabajo completado',
      '"' || v_title || '" fue marcado como completado. Ya puedes calificar.',
      jsonb_build_object('jobId', new.job_id, 'assignmentId', new.id),
      'normal', new.job_id
    );

  elsif new.status = 'cancelado' then
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      case when new.employer_id = auth.uid() then new.worker_id else new.employer_id end,
      'system', 'Contratación cancelada',
      'La contratación de "' || v_title || '" fue cancelada.',
      jsonb_build_object('jobId', new.job_id, 'assignmentId', new.id),
      'high', new.job_id
    );

  elsif new.status = 'confirmado' then
    insert into public.notifications
      (user_id, type, title, body, data, priority, job_id)
    values (
      new.employer_id, 'system', 'El trabajador confirmó',
      'El trabajador confirmó su participación en "' || v_title || '".',
      jsonb_build_object('jobId', new.job_id, 'assignmentId', new.id),
      'normal', new.job_id
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_assignment_status_changed on public.job_assignments;
create trigger on_assignment_status_changed
  after update on public.job_assignments
  for each row execute function public.notify_assignment_status_changed();

-- ------------------------------------------------------------
-- Backfill: crear asignaciones para contrataciones ya existentes
-- ------------------------------------------------------------
insert into public.job_assignments
  (job_id, worker_id, employer_id, application_id, status, started_at, completed_at, created_at)
select
  j.id,
  a.worker_id,
  j.employer_id,
  a.id,
  case
    when j.status = 'completado' then 'completado'::public.assignment_status
    when j.status = 'cancelado'  then 'cancelado'::public.assignment_status
    else 'en_progreso'::public.assignment_status
  end,
  j.hired_at,
  j.completed_at,
  coalesce(j.hired_at, a.updated_at)
from public.job_applications a
join public.jobs j on j.id = a.job_id
where a.status = 'aceptado'
on conflict (job_id, worker_id) do nothing;
