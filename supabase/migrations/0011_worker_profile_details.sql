-- ============================================================
-- CHAMBY — Perfil Profesional: información ampliada (Fase 1)
--
-- Campos que no existen ni en `profiles` ni en las tablas de 0010:
-- título profesional, distrito, dirección, fecha de nacimiento,
-- WhatsApp, disponibilidad, tarifas, años de experiencia, idiomas,
-- radio de trabajo. Tabla 1:1 con `profiles`, no se altera `profiles`
-- (evita romper cualquier lectura existente de esa tabla en el resto
-- de la app — Navbar, dashboards, admin, chat, ratings, etc.).
--
-- Deliberadamente NO se dividió `full_name` en nombre/apellido: ese
-- campo se usa tal cual en todo el proyecto (ver docs/AUDITORIA-*.md);
-- separarlo es un cambio transversal fuera del alcance de esta fase.
-- ============================================================

do $$ begin
  create type public.availability_status as enum (
    'inmediata', 'una_semana', 'un_mes', 'no_disponible'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.worker_profile_details (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  professional_title text,
  district          text,
  address           text,
  birth_date        date,
  whatsapp          text,
  availability      public.availability_status not null default 'inmediata',
  hourly_rate       numeric(10,2),
  daily_rate        numeric(10,2),
  years_experience  int,
  languages         text[] not null default '{}',
  work_radius_km    int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_worker_profile_details_updated_at on public.worker_profile_details;
create trigger trg_worker_profile_details_updated_at
  before update on public.worker_profile_details
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — mismo patrón que profile_stats (0010):
-- solo el dueño lee/escribe su fila; admin puede leer para moderación.
-- ------------------------------------------------------------
alter table public.worker_profile_details enable row level security;

drop policy if exists "worker_details_select_own" on public.worker_profile_details;
drop policy if exists "worker_details_insert_own" on public.worker_profile_details;
drop policy if exists "worker_details_update_own" on public.worker_profile_details;

create policy "worker_details_select_own" on public.worker_profile_details
  for select using (auth.uid() = profile_id or public.current_user_role() = 'admin');
create policy "worker_details_insert_own" on public.worker_profile_details
  for insert with check (auth.uid() = profile_id);
create policy "worker_details_update_own" on public.worker_profile_details
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
