-- ============================================================
-- CHAMBY — Sistema de roles múltiples (migración 0008)
-- ============================================================
-- ESTRATEGIA:
--   profiles.role  = modo activo (qué rol está usando AHORA)
--   user_roles     = roles que posee el usuario (puede tener varios)
--
-- Las 23 políticas RLS existentes usan current_user_role() que
-- lee profiles.role → NO se modifican. switchRole() actualiza
-- profiles.role y el modo cambia de inmediato.
-- ============================================================

-- ------------------------------------------------------------
-- TABLA: user_roles
-- Roles que posee un usuario (puede tener worker + employer)
-- ------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid         primary key default uuid_generate_v4(),
  user_id     uuid         not null references public.profiles(id) on delete cascade,
  role        user_role    not null,
  active      boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  unique (user_id, role)
);

comment on table public.user_roles is
  'Roles que posee un usuario. profiles.role indica cuál está activo ahora.';

-- Trigger updated_at
drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS para user_roles
-- ------------------------------------------------------------
alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

-- El usuario solo puede añadir worker o employer (no admin)
drop policy if exists "user_roles_insert_own" on public.user_roles;
create policy "user_roles_insert_own"
  on public.user_roles for insert
  with check (
    auth.uid() = user_id
    and role::text in ('worker', 'employer')
  );

drop policy if exists "user_roles_update_own" on public.user_roles;
create policy "user_roles_update_own"
  on public.user_roles for update
  using (auth.uid() = user_id);

drop policy if exists "user_roles_delete_admin" on public.user_roles;
create policy "user_roles_delete_admin"
  on public.user_roles for delete
  using (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- MIGRAR USUARIOS EXISTENTES
-- Cada usuario actual obtiene su rol presente en user_roles
-- ------------------------------------------------------------
insert into public.user_roles (user_id, role)
select id, role
from   public.profiles
on conflict (user_id, role) do nothing;

-- ------------------------------------------------------------
-- HELPER: user_has_role(role)
-- Comprueba si el usuario autenticado posee un rol activo
-- ------------------------------------------------------------
create or replace function public.user_has_role(check_role user_role)
returns boolean as $$
  select exists (
    select 1 from public.user_roles
    where  user_id = auth.uid()
    and    role    = check_role
    and    active  = true
  );
$$ language sql stable security definer set search_path = public;

-- ------------------------------------------------------------
-- ACTUALIZAR handle_new_user
-- También inserta en user_roles al crear un nuevo usuario
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role       user_role;
  v_full_name  text;
  v_city       text;
  v_category   text;
  v_avatar_url text;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'role')::user_role,
    'worker'
  );
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    'Nuevo usuario'
  );
  v_city       := new.raw_user_meta_data->>'city';
  v_category   := new.raw_user_meta_data->>'category';
  v_avatar_url := new.raw_user_meta_data->>'avatar_url';

  insert into public.profiles (id, role, full_name, city, category, avatar_url)
  values (new.id, v_role, v_full_name, v_city, v_category, v_avatar_url)
  on conflict (id) do nothing;

  -- Registrar el rol inicial en user_roles
  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- REPUTACIÓN SEPARADA: rated_as_role en ratings
-- Permite calcular rating como trabajador vs rating como empleador
-- ------------------------------------------------------------
alter table public.ratings
  add column if not exists rated_as_role user_role not null default 'worker';

-- Rellenar retroactivamente desde el contexto de cada trabajo
update public.ratings r
set    rated_as_role = case
         when r.rated_id = j.assigned_worker_id then 'worker'::user_role
         when r.rated_id = j.employer_id         then 'employer'::user_role
         else                                         'worker'::user_role
       end
from   public.jobs j
where  r.job_id = j.id;

-- Vista: calificaciones recibidas como trabajador
create or replace view public.worker_rating_summary as
select
  rated_id as profile_id,
  round(avg(score)::numeric, 2) as average_score,
  count(*) as total_ratings
from   public.ratings
where  rated_as_role = 'worker'
group  by rated_id;

-- Vista: calificaciones recibidas como empleador
create or replace view public.employer_rating_summary as
select
  rated_id as profile_id,
  round(avg(score)::numeric, 2) as average_score,
  count(*) as total_ratings
from   public.ratings
where  rated_as_role = 'employer'
group  by rated_id;

-- RLS para las nuevas vistas (misma lógica que rating_summary)
drop policy if exists "worker_rating_summary_select" on public.worker_rating_summary;
drop policy if exists "employer_rating_summary_select" on public.employer_rating_summary;
