-- ============================================================
-- CHAMBY — FASE 3E (Calendario): copiar horario propuesto/confirmado
-- a jobs al aceptar la postulación.
-- ============================================================
-- Alcance exclusivo de esta migración: CREATE OR REPLACE de la función
-- existente public.handle_application_accepted(). No crea funciones,
-- tablas, columnas ni índices. No modifica RLS, policies ni GRANTS. No
-- modifica 0051, 0052, 0053 ni 0054. No toca el EXCLUDE de 0053 ni el
-- trigger de consentimiento de 0054.
--
-- Único cambio funcional: dentro del mismo UPDATE public.jobs que ya
-- asigna assigned_worker_id/status/hired_at, también se copian
-- scheduled_start_at/scheduled_end_at desde
-- proposed_start_at/proposed_end_at, pero solo cuando la propuesta está
-- completa y confirmada por el trabajador (proposed_start_at,
-- proposed_end_at y worker_schedule_confirmed_at los 3 no nulos). En
-- cualquier otro caso scheduled_* conserva su valor actual (incluido el
-- caso, ya válido hoy, de aceptar sin ninguna propuesta).
--
-- El EXCLUDE jobs_no_overlapping_worker_bookings (0053) sigue siendo la
-- única garantía de integridad anti-solapamiento: si el horario copiado
-- viola ese constraint, Postgres levanta SQLSTATE 23P01 sin que esta
-- función lo capture, oculte ni convierta en éxito — aborta toda la
-- transacción, revirtiendo también la aceptación de job_applications.
-- El manejo amigable de ese error queda fuera de esta migración
-- (corresponde a una futura Server Action).
-- ============================================================

create or replace function public.handle_application_accepted()
returns trigger as $function$
declare
  v_job record;
  v_conversation_id uuid;
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    select * into v_job from public.jobs where id = new.job_id for update;
    if v_job.status <> 'abierto' then
      raise exception 'Este trabajo ya no acepta postulantes';
    end if;

    update public.jobs
      set assigned_worker_id = new.worker_id,
          status   = 'en_progreso',
          hired_at = now(),
          scheduled_start_at = case
            when new.proposed_start_at is not null
             and new.proposed_end_at is not null
             and new.worker_schedule_confirmed_at is not null
            then new.proposed_start_at
            else scheduled_start_at
          end,
          scheduled_end_at = case
            when new.proposed_start_at is not null
             and new.proposed_end_at is not null
             and new.worker_schedule_confirmed_at is not null
            then new.proposed_end_at
            else scheduled_end_at
          end
      where id = new.job_id;

    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id
        and id <> new.id
        and status = 'pendiente';

    insert into public.conversations (job_id, employer_id, worker_id)
      values (new.job_id, v_job.employer_id, new.worker_id)
      on conflict (job_id) do nothing
      returning id into v_conversation_id;

    if v_conversation_id is null then
      select id into v_conversation_id
        from public.conversations
        where job_id = new.job_id;
    end if;

    -- Backfill del dato que notify_application_status_changed() (0004)
    -- no pudo completar porque corre antes, alfabéticamente, y la
    -- conversación todavía no existía en ese instante.
    update public.notifications
      set conversation_id = v_conversation_id
      where job_id = new.job_id
        and user_id = new.worker_id
        and type = 'application_accepted'
        and conversation_id is null;

    insert into public.job_state_history
      (job_id, actor_id, prev_status, new_status, notes)
      values (new.job_id, v_job.employer_id, 'abierto', 'en_progreso',
              'Trabajador aceptado');
  end if;
  return new;
end;
$function$ language plpgsql security definer set search_path = public;
