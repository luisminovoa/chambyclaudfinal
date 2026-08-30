-- ============================================================
-- CHAMBY — public_workers: adopta ubicación jerárquica (Fase 6,
-- C4-G18 — adopción de Ubigeo en descubrimiento)
--
-- 0041_add_hierarchical_location.sql agregó profiles.department/province
-- y reutilizó profiles.district (ya existente) como el distrito
-- estructurado, para worker y employer por igual. public.public_workers
-- (0037_public_workers_directory.sql) todavía proyecta únicamente `city`
-- — el directorio de trabajadores (/workers) y el perfil público de un
-- trabajador no pueden mostrar ni filtrar por departamento/provincia/
-- distrito hasta que esta vista los exponga.
--
-- CREATE OR REPLACE VIEW empareja columnas por POSICIÓN, no por nombre:
-- Postgres rechaza el reemplazo si cambia nombre/tipo/orden de una
-- columna ya existente (SQLSTATE 42P16 "cannot change name of view
-- column ..."; el propio historial de este repositorio lo sufrió en
-- 0021_reporter_reports_view_description.sql, corregido en
-- 0032_reporter_reports_view_description_fix.sql agregando la columna
-- nueva al FINAL en vez de en medio). Por eso las 13 columnas de 0037
-- se conservan EXACTAMENTE en su orden original, y department/province/
-- district se agregan como las tres últimas columnas.
--
-- Fuente: p.department/p.province/p.district (public.profiles), NUNCA
-- worker_profile_details.district — ese es un campo de texto libre
-- histórico, separado y sin validar contra el catálogo Ubigeo (ver
-- 0041, WorkerProfileDetails en src/lib/types.ts), y worker_directory.ts
-- ya documenta que nunca debe exponerse en un directorio público. La
-- ubicación estructurada del trabajador vive en profiles, igual que la
-- del empleador (0041).
--
-- Esta migración SOLO agrega columnas a la definición de la vista.
-- No hay ALTER TABLE, no hay DROP, no cambia ninguna columna existente,
-- no toca RLS/policies de profiles ni worker_profile_details, no crea
-- triggers. Los GRANT/REVOKE se reafirman idénticos a 0037 (SOLO LECTURA
-- para `authenticated`) — no se amplía a ningún rol nuevo.
-- ============================================================

drop view if exists public.public_workers;
create view public.public_workers as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.city,
    p.category,
    p.skills,
    p.bio,
    p.created_at,
    d.professional_title,
    d.availability,
    d.years_experience,
    d.hourly_rate,
    d.daily_rate,
    p.department,
    p.province,
    p.district
  from public.profiles p
  left join public.worker_profile_details d on d.profile_id = p.id
  where p.is_active and p.role = 'worker';

comment on view public.public_workers is
  'Proyección pública de solo lectura para el directorio de trabajadores (0037). Fase 6 (C4-G18) agregó department/province/district (de public.profiles, ubicación jerárquica Perú — nunca worker_profile_details.district) al final de las columnas para no romper CREATE OR REPLACE VIEW. Nunca expone phone, business_ruc, whatsapp, birth_date, address ni ningún documento de verificación. Excluye admins, employers y trabajadores inactivos. No usar profiles ni worker_profile_details directamente para leer el perfil de un tercero sin relación establecida.';

-- ------------------------------------------------------------
-- Grants: idénticos a 0037 — SOLO LECTURA, SOLO para authenticated.
-- REVOKE explícito primero porque CREATE OR REPLACE VIEW no conserva
-- necesariamente los grants previos en todos los motores/versiones —
-- mismo patrón defensivo ya usado en 0036/0037.
-- ------------------------------------------------------------
revoke all on public.public_workers from public;
revoke all on public.public_workers from anon;
revoke all on public.public_workers from authenticated;
revoke all on public.public_workers from service_role;

grant select on public.public_workers to authenticated;
