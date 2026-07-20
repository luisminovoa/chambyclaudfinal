-- ============================================================
-- CHAMBY - Esquema inicial de base de datos
-- ============================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
do $$ begin
  create type user_role as enum ('worker', 'employer', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type job_status as enum ('abierto', 'en_progreso', 'completado', 'cancelado');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type application_status as enum ('pendiente', 'aceptado', 'rechazado', 'retirado');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type pay_type as enum ('por_hora', 'por_dia', 'fijo');
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- TABLA: profiles
-- Extiende auth.users con datos de perfil de Chamby
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'worker',
  full_name text not null,
  phone text,
  city text,
  category text,           -- puesto/categoría principal (para trabajadores)
  skills text[] default '{}',
  bio text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfiles de usuarios: trabajadores, empleadores y administradores';

-- ------------------------------------------------------------
-- TABLA: jobs
-- Publicaciones de trabajo hechas por empleadores
-- ------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  employer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,        -- puesto (ej. "Electricista", "Niñera", "Albañil")
  city text not null,
  address text,
  pay_amount numeric(10,2),
  pay_type pay_type not null default 'fijo',
  status job_status not null default 'abierto',
  positions_needed int not null default 1,
  assigned_worker_id uuid references public.profiles(id) on delete set null,
  starts_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_city on public.jobs (city);
create index if not exists idx_jobs_category on public.jobs (category);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_employer on public.jobs (employer_id);

-- ------------------------------------------------------------
-- TABLA: job_applications
-- Postulaciones de trabajadores a un job
-- ------------------------------------------------------------
create table if not exists public.job_applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  status application_status not null default 'pendiente',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create index if not exists idx_applications_job on public.job_applications (job_id);
create index if not exists idx_applications_worker on public.job_applications (worker_id);

-- ------------------------------------------------------------
-- TABLA: ratings
-- Calificaciones mutuas al finalizar un trabajo
-- ------------------------------------------------------------
create table if not exists public.ratings (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (job_id, rater_id, rated_id)
);

create index if not exists idx_ratings_rated on public.ratings (rated_id);

-- ------------------------------------------------------------
-- VISTA: worker_rating_summary
-- Promedio y conteo de calificaciones por trabajador/empleador
-- ------------------------------------------------------------
create or replace view public.rating_summary as
select
  rated_id as profile_id,
  round(avg(score)::numeric, 2) as average_score,
  count(*) as total_ratings
from public.ratings
group by rated_id;

-- ------------------------------------------------------------
-- FUNCIONES Y TRIGGERS
-- ------------------------------------------------------------

-- Actualiza updated_at automáticamente
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_applications_updated_at on public.job_applications;
create trigger trg_applications_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- Crea automáticamente un profile cuando se registra un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, city, category)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'worker'),
    coalesce(new.raw_user_meta_data->>'full_name', 'Nuevo usuario'),
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'category'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuando se acepta una postulación, asigna el trabajador y cierra las demás postulaciones
create or replace function public.handle_application_accepted()
returns trigger as $$
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    update public.jobs
      set assigned_worker_id = new.worker_id,
          status = 'en_progreso'
      where id = new.job_id;

    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id
        and id <> new.id
        and status = 'pendiente';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_application_accepted on public.job_applications;
create trigger trg_application_accepted
  after update on public.job_applications
  for each row execute function public.handle_application_accepted();

-- Helper: obtiene el rol del usuario autenticado actual
create or replace function public.current_user_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;
alter table public.ratings enable row level security;

-- PROFILES: lectura pública (info básica visible para todos los logueados),
-- escritura solo del propio usuario; admin puede todo.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  using (public.current_user_role() = 'admin');

-- JOBS: lectura pública; creación solo empleadores dueños; actualización dueño o admin
drop policy if exists "jobs_select_all" on public.jobs;
create policy "jobs_select_all"
  on public.jobs for select
  using (true);

drop policy if exists "jobs_insert_employer" on public.jobs;
create policy "jobs_insert_employer"
  on public.jobs for insert
  with check (
    auth.uid() = employer_id
    and public.current_user_role() in ('employer', 'admin')
  );

drop policy if exists "jobs_update_owner_or_admin" on public.jobs;
create policy "jobs_update_owner_or_admin"
  on public.jobs for update
  using (auth.uid() = employer_id or public.current_user_role() = 'admin');

drop policy if exists "jobs_delete_owner_or_admin" on public.jobs;
create policy "jobs_delete_owner_or_admin"
  on public.jobs for delete
  using (auth.uid() = employer_id or public.current_user_role() = 'admin');

-- JOB_APPLICATIONS: el trabajador ve/crea las suyas; el empleador ve las de sus jobs
drop policy if exists "applications_select" on public.job_applications;
create policy "applications_select"
  on public.job_applications for select
  using (
    auth.uid() = worker_id
    or auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
    or public.current_user_role() = 'admin'
  );

drop policy if exists "applications_insert_worker" on public.job_applications;
create policy "applications_insert_worker"
  on public.job_applications for insert
  with check (
    auth.uid() = worker_id
    and public.current_user_role() in ('worker', 'admin')
  );

drop policy if exists "applications_update" on public.job_applications;
create policy "applications_update"
  on public.job_applications for update
  using (
    auth.uid() = worker_id
    or auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
    or public.current_user_role() = 'admin'
  );

-- RATINGS: lectura pública (para ver reputación); creación solo por participantes del job
drop policy if exists "ratings_select_all" on public.ratings;
create policy "ratings_select_all"
  on public.ratings for select
  using (true);

drop policy if exists "ratings_insert_participant" on public.ratings;
create policy "ratings_insert_participant"
  on public.ratings for insert
  with check (
    auth.uid() = rater_id
    and (
      auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
      or auth.uid() in (select assigned_worker_id from public.jobs where jobs.id = job_id)
    )
  );
