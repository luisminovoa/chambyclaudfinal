-- ============================================================
-- CHAMBY — conversation_id en la notificación application_accepted
--
-- Causa raíz: dos triggers AFTER UPDATE independientes sobre
-- job_applications, ejecutados en orden alfabético por nombre de
-- trigger (así decide Postgres el orden cuando hay varios triggers
-- para el mismo evento y misma tabla):
--   "on_application_status_changed" (0004_notifications.sql)
--     — inserta la notificación 'application_accepted'
--   "trg_application_accepted" (0001_init.sql / 0002_hiring_tracking.sql)
--     — crea la fila en conversations
-- "on_..." ordena alfabéticamente antes que "trg_...", así que la
-- notificación se inserta ANTES de que exista la conversación —
-- conversation_id queda NULL, sin forma de que
-- notify_application_status_changed() la conozca en ese momento.
--
-- Corrección mínima: handle_application_accepted() —que siempre corre
-- DESPUÉS y es quien de verdad crea/conoce la conversación— actualiza
-- la notificación que la otra trigger ya insertó. Se descartaron:
-- (a) reordenar triggers renombrándolos: frágil, depende de nombres,
--     nada documenta esa dependencia de orden salvo el propio nombre;
-- (b) mover la creación de conversación a notify_application_status_changed():
--     violaría "no modificar el flujo de negocio" de esa función y
--     duplicaría lógica que ya vive en handle_application_accepted().
-- No se toca 0004_notifications.sql. No se agregan columnas, tablas
-- ni policies — mismo boundary de seguridad de siempre (security
-- definer, sin RLS nueva).
-- ============================================================

create or replace function public.handle_application_accepted()
returns trigger as $$
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
          hired_at = now()
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
$$ language plpgsql security definer set search_path = public;
