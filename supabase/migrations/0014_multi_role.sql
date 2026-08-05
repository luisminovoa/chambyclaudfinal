-- ============================================================
-- CHAMBY — Sistema Multi-Rol (Fase 1)
-- Diseño aprobado: docs/DISENO-MULTI-ROL.md
--
-- profiles.role  = MODO ACTIVO (sin cambios — las 23 policies RLS
--                  existentes siguen leyendo current_user_role())
-- user_roles     = ROLES QUE POSEE el usuario (puede tener varios)
--
-- Cierra explícitamente V4 (docs/SECURITY_AUDIT_v0.8.md): el intento
-- anterior no mergeado (PR #15, commit fa5b0c9) tenía
-- "user_roles_update_own" con USING sin WITH CHECK — mismo patrón que
-- V1. Aquí se cierra desde el día uno con WITH CHECK explícito +
-- GRANT a nivel de columna (mismo patrón que
-- 0013_harden_profile_module_rls.sql).
--
-- Toda la migración corre en una sola transacción implícita de
-- psql/Supabase (un archivo .sql = una transacción) — no hay ventana
-- donde user_roles exista vacía mientras profiles ya tiene usuarios.
-- No se modifica ningún comportamiento de la aplicación en esta fase.
-- ============================================================

-- ------------------------------------------------------------
-- TABLA: user_roles
-- ------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid         primary key default uuid_generate_v4(),
  user_id     uuid         not null references public.profiles(id) on delete cascade,
  role        user_role    not null,
  active      boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  constraint user_roles_user_role_unique unique (user_id, role)
);

comment on table public.user_roles is
  'Roles que posee un usuario (puede tener worker + employer). profiles.role indica cuál está activo ahora.';

create index if not exists idx_user_roles_user
  on public.user_roles (user_id);

drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
drop policy if exists "user_roles_insert_own" on public.user_roles;
drop policy if exists "user_roles_update_own" on public.user_roles;
drop policy if exists "user_roles_delete_admin" on public.user_roles;

create policy "user_roles_select_own"
  on public.user_roles for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

-- El usuario solo puede añadirse worker o employer — nunca admin.
create policy "user_roles_insert_own"
  on public.user_roles for insert
  with check (
    auth.uid() = user_id
    and role in ('worker', 'employer')
  );

-- WITH CHECK obligatorio (V4): sin esto, Postgres reutiliza USING sobre
-- la fila resultante y un usuario podría reescribir su propio `role` a
-- 'admin'. Se restringe explícitamente el valor final permitido.
create policy "user_roles_update_own"
  on public.user_roles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and role in ('worker', 'employer'));

-- Un usuario no puede borrar su propio historial de roles — solo
-- desactivarlo (active = false, permitido por el candado de columna
-- de abajo). Borrado físico es exclusivo de admin (moderación).
create policy "user_roles_delete_admin"
  on public.user_roles for delete
  using (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- CANDADO 2 — GRANT a nivel de columna (defense-in-depth, V4)
-- 'active' es la única columna que cualquier flujo de producción
-- necesita mutar tras el INSERT (activar/desactivar un rol ya
-- poseído). 'role' y 'user_id' nunca deben ser escribibles vía
-- UPDATE, sin importar lo que diga la policy — mismo patrón que
-- profile_photos en 0013_harden_profile_module_rls.sql.
-- ------------------------------------------------------------
revoke update on public.user_roles from authenticated;
grant update (active) on public.user_roles to authenticated;

-- ------------------------------------------------------------
-- MIGRAR USUARIOS EXISTENTES
-- Cada usuario actual obtiene su role presente como su primera fila
-- en user_roles. on conflict do nothing: re-ejecutar esta migración
-- (o correrla tras un handle_new_user ya actualizado) es inofensivo.
-- ------------------------------------------------------------
insert into public.user_roles (user_id, role)
select id, role
from   public.profiles
on conflict (user_id, role) do nothing;

-- ------------------------------------------------------------
-- HELPER: user_has_role(role)
-- No se usa en ninguna policy existente (no toca las 23 policies ya
-- auditadas) — para uso desde Server Actions (src/lib/actions/roles.ts).
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
-- ACTUALIZAR handle_new_user: también inserta en user_roles al crear
-- una cuenta nueva. Mismo patrón on conflict do nothing que ya usa
-- para profiles — un signup duplicado (reintento de OAuth) sigue
-- siendo inofensivo.
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

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
