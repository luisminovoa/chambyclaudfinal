-- ============================================================
-- CHAMBY — FASE 3A (Calendario): disponibilidad recurrente semanal
-- ============================================================
-- Único objeto de negocio de esta migración: profile_availability_slots.
-- No modifica jobs, job_applications, notifications, ni ninguna tabla,
-- función o trigger existente. profile_id referencia profiles(id) para
-- que la misma estructura sirva tanto a workers como a employers sin
-- duplicar el modelo — el rol activo/poseído no cambia qué fila es
-- "propia", solo auth.uid() = profile_id lo determina.
-- ============================================================

create table public.profile_availability_slots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_availability_slots_day_of_week_check
    check (day_of_week between 0 and 6),
  constraint profile_availability_slots_time_range_check
    check (end_time > start_time)
);

create index idx_profile_availability_slots_profile_id
  on public.profile_availability_slots (profile_id);

create index idx_profile_availability_slots_profile_day
  on public.profile_availability_slots (profile_id, day_of_week);

-- ------------------------------------------------------------
-- RLS: lectura pública (necesaria para que la otra parte consulte
-- disponibilidad antes de proponer/aceptar horario, mismo criterio que
-- public_workers), escritura solo del dueño. Sin rama de admin: no
-- estaba en el modelo aprobado para esta fase: se deja fuera hasta que
-- se autorice explícitamente, en vez de añadirla por costumbre.
-- ------------------------------------------------------------
alter table public.profile_availability_slots enable row level security;

create policy "availability_slots_select_all"
  on public.profile_availability_slots for select
  using (true);

create policy "availability_slots_insert_own"
  on public.profile_availability_slots for insert
  with check (profile_id = auth.uid());

create policy "availability_slots_update_own"
  on public.profile_availability_slots for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "availability_slots_delete_own"
  on public.profile_availability_slots for delete
  using (profile_id = auth.uid());
