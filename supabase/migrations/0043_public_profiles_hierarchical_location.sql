-- ============================================================
-- CHAMBY — public_profiles: adopta ubicación jerárquica (Fase 6,
-- C4-G18 — adopción de Ubigeo en descubrimiento)
--
-- Mismo objetivo que 0042_public_workers_hierarchical_location.sql,
-- para public.public_profiles (0034_harden_profiles_public_access.sql):
-- el perfil público del empleador (EmployerPublicProfileView) y el
-- detalle de trabajo (/jobs/[id], que resuelve al empleador vía esta
-- vista) necesitan department/province/district para mostrar la
-- ubicación jerárquica en vez de depender solo de `city`.
--
-- Mismo motivo posicional que 0042 (ver ese archivo y el precedente
-- real de este repositorio: 0021/0032): las 12 columnas de 0034 se
-- conservan EXACTAMENTE en su orden original; department/province/
-- district se agregan al final.
--
-- Fuente: department/province/district de public.profiles (agregadas/
-- reutilizadas en 0041_add_hierarchical_location.sql) — la misma tabla
-- base que ya usa esta vista, sin JOIN nuevo. No se exponen documentos
-- de verificación, reviewer, rejection_reason, storage_path ni ninguna
-- columna administrativa: esta vista sigue proyectando exclusivamente
-- desde public.profiles, igual que en 0034.
--
-- Esta migración SOLO agrega columnas a la definición de la vista.
-- No hay ALTER TABLE, no hay DROP, no cambia ninguna columna existente,
-- no toca RLS/policies de profiles, no crea triggers. Los GRANT/REVOKE
-- se reafirman idénticos a 0036 (SELECT para anon/authenticated/
-- service_role) — no se amplía a ningún rol nuevo ni se agrega DML.
-- ============================================================

drop view if exists public.public_profiles;
create view public.public_profiles as
  select
    id,
    full_name,
    avatar_url,
    city,
    category,
    skills,
    bio,
    created_at,
    employer_type,
    business_name,
    business_sector,
    business_description,
    department,
    province,
    district
  from public.profiles
  where is_active and role <> 'admin';

comment on view public.public_profiles is
  'Proyección pública de profiles (0034 EXPAND / 0035 CONTRACT). Fase 6 (C4-G18) agregó department/province/district (ubicación jerárquica Perú, 0041) al final de las columnas para no romper CREATE OR REPLACE VIEW. Nunca expone phone, business_ruc, role, is_active ni updated_at. Excluye usuarios inactivos y administradores. No usar public.profiles directamente para leer el perfil de un tercero.';

-- ------------------------------------------------------------
-- Grants: idénticos a 0036 — SOLO LECTURA para anon/authenticated/
-- service_role. REVOKE explícito primero, mismo patrón defensivo ya
-- usado en 0036/0037/0042.
-- ------------------------------------------------------------
revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
revoke all on public.public_profiles from service_role;

grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;
