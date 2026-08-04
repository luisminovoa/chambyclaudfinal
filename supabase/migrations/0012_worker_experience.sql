-- ============================================================
-- CHAMBY — Perfil Profesional: experiencia laboral (Fase 2)
--
-- Tabla nueva, múltiples filas por trabajador (a diferencia de
-- worker_profile_details, que es 1:1). CRUD completo, propietario.
-- ============================================================

create table if not exists public.worker_experience (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  company     text not null,
  job_title   text not null,
  start_date  date not null,
  end_date    date,
  is_current  boolean not null default false,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint worker_experience_current_no_end
    check (not is_current or end_date is null),
  constraint worker_experience_end_after_start
    check (end_date is null or end_date >= start_date)
);

create index if not exists idx_worker_experience_profile
  on public.worker_experience (profile_id, start_date desc);

drop trigger if exists trg_worker_experience_updated_at on public.worker_experience;
create trigger trg_worker_experience_updated_at
  before update on public.worker_experience
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — CRUD completo, solo el propietario;
-- admin conserva lectura para moderación (mismo patrón que
-- worker_profile_details, 0011).
-- ------------------------------------------------------------
alter table public.worker_experience enable row level security;

drop policy if exists "experience_select_own" on public.worker_experience;
drop policy if exists "experience_insert_own" on public.worker_experience;
drop policy if exists "experience_update_own" on public.worker_experience;
drop policy if exists "experience_delete_own" on public.worker_experience;

create policy "experience_select_own" on public.worker_experience
  for select using (auth.uid() = profile_id or public.current_user_role() = 'admin');
create policy "experience_insert_own" on public.worker_experience
  for insert with check (auth.uid() = profile_id);
create policy "experience_update_own" on public.worker_experience
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "experience_delete_own" on public.worker_experience
  for delete using (auth.uid() = profile_id);
