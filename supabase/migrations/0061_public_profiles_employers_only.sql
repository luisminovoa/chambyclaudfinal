-- ============================================================
-- CHAMBY — public_profiles: solo empleadores (user_roles, multi-rol)
--
-- Hallazgo de auditoría: la vista (0034/0043) filtraba solo
-- `is_active and role <> 'admin'`, así que exponía a TRABAJADORES al rol
-- `anon` vía la API REST de Supabase, eludiendo la restricción de
-- public_workers (SELECT solo para `authenticated`). La app solo necesita
-- esta vista públicamente para datos de EMPLEADOR (/, /jobs, /jobs/[id],
-- /employers/[id]).
--
-- Nueva regla — una fila por perfil que cumpla TODO:
--   1. profiles.is_active
--   2. profiles.role <> 'admin' (modo activo distinto de admin)
--   3. posee un user_roles(role='employer', active=true)
--   4. NO posee un user_roles(role='admin', active=true) — un admin puede
--      cambiar su modo activo a employer (0018), y ahí profiles.role ya
--      no dice 'admin'; esta cláusula lo mantiene fuera igualmente.
--
-- "Es empleador" se decide contra user_roles (roles POSEÍDOS), no contra
-- profiles.role (modo activo, mutable vía switchRoleAction()): un usuario
-- worker+employer aparece sin importar su modo activo — mismo criterio
-- que getEmployerPublicProfile(). UNIQUE (user_id, role) en user_roles
-- (0014) y el uso de EXISTS/NOT EXISTS (semi-join) garantizan a lo sumo
-- una fila por perfil.
--
-- Esta migración SOLO cambia el WHERE de la vista. CREATE OR REPLACE VIEW
-- con las mismas 15 columnas, mismo orden, nombres y tipos que 0043 (si
-- alguno cambiara, Postgres rechazaría el reemplazo con 42P16). No hay
-- DROP, no se toca RLS de profiles ni las policies de user_roles. La vista
-- sigue siendo SECURITY DEFINER (sin security_invoker) a propósito, igual
-- que en 0034/0043: corre con los privilegios del dueño, por lo que lee
-- user_roles sin pasar por sus policies. Los GRANT/REVOKE se reafirman
-- idénticos a 0043 (SELECT para anon/authenticated/service_role).
--
-- Requisito de despliegue: src/app/jobs/[id]/page.tsx debe leer al
-- trabajador asignado SIN public_profiles (ver ese archivo) ANTES de
-- aplicar esta migración; si no, la tarjeta del trabajador asignado
-- desaparece para el dueño.
--
-- Rollback: reaplicar la definición de 0043_public_profiles_hierarchical_
-- location.sql (WHERE is_active and role <> 'admin').
-- ============================================================

create or replace view public.public_profiles as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.city,
    p.category,
    p.skills,
    p.bio,
    p.created_at,
    p.employer_type,
    p.business_name,
    p.business_sector,
    p.business_description,
    p.department,
    p.province,
    p.district
  from public.profiles p
  where p.is_active
    and p.role <> 'admin'
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'employer'
        and ur.active
    )
    and not exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'admin'
        and ur.active
    );

comment on view public.public_profiles is
  'Proyección pública de EMPLEADORES (rol employer activo en user_roles; excluye admins e inactivos). 0061 la restringió: antes incluía también trabajadores (0034/0043). Nunca expone phone, business_ruc, role ni is_active. Para trabajadores usar public_workers (SELECT solo para authenticated). No usar public.profiles directamente para leer el perfil de un tercero.';

-- ------------------------------------------------------------
-- Grants: idénticos a 0043 — SOLO LECTURA para anon/authenticated/
-- service_role. REVOKE explícito primero, mismo patrón defensivo de
-- 0036/0037/0042/0043.
-- ------------------------------------------------------------
revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
revoke all on public.public_profiles from service_role;

grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;
