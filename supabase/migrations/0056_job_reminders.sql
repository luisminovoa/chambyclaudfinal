-- ============================================================
-- CHAMBY — P1.2 (recordatorios de trabajo agendado): primera pieza,
-- solo ventana de 1 hora antes. NO incluye 24h ni ninguna otra ventana.
-- ============================================================
-- Alcance exclusivo de esta migración: extensión pg_cron, tabla de
-- control de idempotencia job_reminders, función SECURITY DEFINER
-- send_job_reminders() y su registro en pg_cron. No modifica jobs,
-- job_applications, notifications (solo INSERTa filas, no altera su
-- esquema), ni ninguna migración/objeto existente.
--
-- jobs.status='en_progreso' es obligatorio en el filtro: completeJob()/
-- cancelJob() no limpian scheduled_start_at/end_at, así que un job
-- completado o cancelado puede conservar un horario residual — sin este
-- filtro se enviarían recordatorios de trabajos que ya no están vigentes.
--
-- Idempotencia: UNIQUE (job_id, recipient_id, reminder_type) en
-- job_reminders es el mecanismo real — ON CONFLICT DO NOTHING + FOUND
-- deciden si corresponde crear la notification, nunca una condición
-- temporal ni un SELECT previo.
-- ============================================================

create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- Tabla de control — nunca se expone más que la lectura propia; toda
-- escritura ocurre exclusivamente desde send_job_reminders() (SECURITY
-- DEFINER, más abajo).
-- ------------------------------------------------------------
create table public.job_reminders (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  reminder_type text not null,
  sent_at timestamptz not null default now(),
  constraint job_reminders_unique unique (job_id, recipient_id, reminder_type)
);

alter table public.job_reminders enable row level security;

create policy "job_reminders_select_own"
  on public.job_reminders
  for select
  using (recipient_id = auth.uid());

-- Sin policy de INSERT/UPDATE/DELETE para authenticated/anon a propósito.

-- ------------------------------------------------------------
-- Función — SECURITY DEFINER porque authenticated/anon no tienen (ni
-- deben tener) INSERT directo sobre notifications ni sobre
-- job_reminders; corre con los privilegios de su dueño (postgres),
-- igual que los triggers de notificación existentes desde 0004.
-- ------------------------------------------------------------
create or replace function public.send_job_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
  v_inserted integer := 0;
begin
  for v_job in
    select id, title, employer_id, assigned_worker_id
    from public.jobs
    where status = 'en_progreso'
      and scheduled_start_at is not null
      and scheduled_end_at is not null
      and assigned_worker_id is not null
      and scheduled_start_at > now() + interval '50 minutes'
      and scheduled_start_at <= now() + interval '70 minutes'
  loop
    insert into public.job_reminders (job_id, recipient_id, reminder_type)
    values (v_job.id, v_job.employer_id, '1h')
    on conflict (job_id, recipient_id, reminder_type) do nothing;

    if found then
      v_inserted := v_inserted + 1;
      insert into public.notifications (user_id, type, title, body, data, priority, job_id)
      values (
        v_job.employer_id,
        'reminder',
        'Trabajo próximo',
        'Tu trabajo "' || v_job.title || '" comienza en aproximadamente 1 hora.',
        jsonb_build_object('jobId', v_job.id, 'reminderType', '1h'),
        'high',
        v_job.id
      );
    end if;

    if v_job.assigned_worker_id is distinct from v_job.employer_id then
      insert into public.job_reminders (job_id, recipient_id, reminder_type)
      values (v_job.id, v_job.assigned_worker_id, '1h')
      on conflict (job_id, recipient_id, reminder_type) do nothing;

      if found then
        v_inserted := v_inserted + 1;
        insert into public.notifications (user_id, type, title, body, data, priority, job_id)
        values (
          v_job.assigned_worker_id,
          'reminder',
          'Trabajo próximo',
          'Tu trabajo "' || v_job.title || '" comienza en aproximadamente 1 hora.',
          jsonb_build_object('jobId', v_job.id, 'reminderType', '1h'),
          'high',
          v_job.id
        );
      end if;
    end if;
  end loop;

  return v_inserted;
end;
$function$;

-- ------------------------------------------------------------
-- Cierre de privilegios — toda función nueva creada por postgres en
-- public recibe EXECUTE automático para PUBLIC (default nativo de
-- Postgres, nunca corregido por 0049) y para authenticated/service_role
-- (default ACL propio de este proyecto) — verificado en vivo contra
-- pg_proc.proacl de funciones existentes antes de esta migración. Sin
-- estos REVOKE, cualquier authenticated (y, por herencia de PUBLIC,
-- anon) podría invocar send_job_reminders() manualmente por RPC.
-- service_role y postgres conservan EXECUTE: postgres es el dueño y el
-- rol bajo el cual corre cron.schedule(); service_role es un credential
-- de confianza total nunca expuesto a un cliente.
-- ------------------------------------------------------------
revoke execute on function public.send_job_reminders() from public;
revoke execute on function public.send_job_reminders() from authenticated;

-- ------------------------------------------------------------
-- Registro en pg_cron — cada 10 minutos, ventana de 20 minutos (50-70
-- min antes del inicio): la banda es el doble de la cadencia, así que
-- todo job elegible es evaluado por al menos 2 ejecuciones consecutivas
-- antes de salir de la ventana, tolerando una corrida retrasada o
-- perdida sin dejar de notificar. cron.schedule() es idempotente por
-- nombre de job — una segunda aplicación accidental de esta migración
-- actualiza el job existente en vez de duplicarlo.
-- ------------------------------------------------------------
select cron.schedule(
  'chamby-job-reminders-1h',
  '*/10 * * * *',
  $$select public.send_job_reminders();$$
);
