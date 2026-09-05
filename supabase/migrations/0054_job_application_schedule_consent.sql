-- ============================================================
-- CHAMBY — FASE 3D (Calendario): doble consentimiento de horario en
-- job_applications, con protección real a nivel de motor.
-- ============================================================
-- Alcance exclusivo: job_applications (columnas, CHECK, función,
-- trigger, GRANT, reemplazo de applications_update). No modifica jobs,
-- ninguna policy de jobs, handle_application_accepted(), ni ninguna
-- otra tabla/migración existente.
--
-- El GRANT UPDATE de columna en Postgres es por rol (authenticated),
-- no distingue worker/employer — ambos comparten el mismo rol de DB.
-- Por eso la garantía real de "quién puede escribir qué valor" no
-- puede depender solo de RLS (que no compara OLD vs NEW) ni solo del
-- GRANT: la cierra el trigger BEFORE UPDATE de abajo, que sí ve OLD y
-- NEW simultáneamente y neutraliza cualquier valor no autorizado antes
-- de que RLS evalúe el WITH CHECK.
-- ============================================================

alter table public.job_applications
  add column proposed_start_at timestamptz null,
  add column proposed_end_at timestamptz null,
  add column worker_schedule_confirmed_at timestamptz null;

alter table public.job_applications
  add constraint job_applications_proposed_schedule_check
  check (
    (proposed_start_at is null and proposed_end_at is null)
    or (proposed_start_at is not null and proposed_end_at is not null
        and proposed_end_at > proposed_start_at)
  );

-- ------------------------------------------------------------
-- Trigger de protección — SECURITY INVOKER (no necesita privilegios
-- elevados: solo corrige la fila que el propio invocador ya tiene
-- permiso de tocar, antes de que RLS evalúe el resultado final).
-- ------------------------------------------------------------
create or replace function public.protect_application_schedule_consent()
returns trigger as $$
begin
  -- El trabajador nunca puede alterar la propuesta del empleador,
  -- toque o no también worker_schedule_confirmed_at en la misma
  -- sentencia.
  if auth.uid() = new.worker_id then
    new.proposed_start_at := old.proposed_start_at;
    new.proposed_end_at := old.proposed_end_at;
  end if;

  -- El empleador nunca puede escribir la confirmación del trabajador.
  if auth.uid() = (select employer_id from public.jobs where id = new.job_id) then
    new.worker_schedule_confirmed_at := old.worker_schedule_confirmed_at;
  end if;

  -- Una transición de estado fuera de 'pendiente' nunca se combina con
  -- un cambio simultáneo del horario en la misma sentencia: el horario
  -- queda congelado al valor que ya tenía antes de esa transición.
  if new.status is distinct from 'pendiente'::application_status then
    new.proposed_start_at := old.proposed_start_at;
    new.proposed_end_at := old.proposed_end_at;
  end if;

  -- Cambiar la propuesta invalida cualquier confirmación previa.
  if new.proposed_start_at is distinct from old.proposed_start_at
     or new.proposed_end_at is distinct from old.proposed_end_at then
    new.worker_schedule_confirmed_at := null;
  end if;

  return new;
end;
$$ language plpgsql security invoker set search_path = public;

create trigger trg_protect_application_schedule_consent
  before update on public.job_applications
  for each row execute function public.protect_application_schedule_consent();

-- ------------------------------------------------------------
-- GRANT mínimo — aditivo, no toca "grant update (status)" ya existente
-- (0008). Necesariamente por rol (authenticated): el trigger de arriba
-- es lo que hace segura esa amplitud.
-- ------------------------------------------------------------
grant update (proposed_start_at, proposed_end_at, worker_schedule_confirmed_at)
  on public.job_applications to authenticated;

-- ------------------------------------------------------------
-- Reemplazo de applications_update: se preservan literalmente las 3
-- ramas existentes (texto capturado en vivo antes de este cambio) y se
-- agregan exactamente 2 nuevas.
-- ------------------------------------------------------------
drop policy if exists "applications_update" on public.job_applications;
create policy "applications_update"
  on public.job_applications for update
  using (
    current_user_role() = 'admin'
    or (status = 'pendiente' and (
      auth.uid() = worker_id
      or auth.uid() in (select employer_id from jobs where jobs.id = job_applications.job_id)
    ))
  )
  with check (
    current_user_role() = 'admin'
    or (auth.uid() = worker_id and status = 'retirado')
    or (status in ('aceptado','rechazado')
        and auth.uid() in (select employer_id from jobs where jobs.id = job_applications.job_id))
    or (status = 'pendiente'
        and proposed_start_at is not null and proposed_end_at is not null
        and auth.uid() in (select employer_id from jobs where jobs.id = job_applications.job_id))
    or (status = 'pendiente'
        and proposed_start_at is not null and proposed_end_at is not null
        and worker_schedule_confirmed_at is not null
        and auth.uid() = worker_id)
  );
