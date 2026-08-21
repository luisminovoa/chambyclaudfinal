-- ============================================================
-- CHAMBY — profiles: EXPAND (public_profiles) — Fase 1 de 2 del
-- cierre de P0 de exposición de PII
--
-- Hallazgo: "profiles_select_all" (0001_init.sql:220-223) es
-- `using (true)` desde el primer commit del esquema y nunca fue
-- redefinida en ninguna de las 33 migraciones posteriores (grep
-- exhaustivo). Tampoco existe ningún GRANT/REVOKE sobre
-- `public.profiles` en todo el repositorio — la única barrera de
-- lectura es esa policy, y permite a CUALQUIER actor (incluida `anon`,
-- la API key pública embebida en el bundle del cliente) leer `phone` y
-- `business_ruc` de CUALQUIER usuario vía la API REST de PostgREST,
-- sin pasar por ninguna Server Action ni por la UI.
--
-- EXPAND phase: public_profiles is introduced while the existing
-- profiles_select_all policy remains active for backward
-- compatibility. The restrictive CONTRACT migration will be
-- introduced separately after production burn-in.
--
-- Investigación de despliegue (esta misma iniciativa): Chamby no
-- tiene ningún mecanismo automático que aplique migraciones de
-- Supabase al hacer merge/deploy — Netlify solo corre `npm run
-- build`, no hay GitHub Actions ni hooks de Supabase en este repo.
-- Las migraciones se aplican manualmente, en un momento distinto al
-- del deploy del frontend. Reemplazar `profiles_select_all` en la
-- MISMA migración que crea `public_profiles` — como hacía la versión
-- original de este archivo — no es seguro bajo esas condiciones:
-- `origin/main` (el código YA desplegado) todavía depende de esa
-- policy siendo permisiva para múltiples lecturas de terceros
-- (embeds `profiles!fkey` en /jobs, /jobs/[id], postulantes; lecturas
-- directas en /employers/[id], chat, reports) — verificado
-- exhaustivamente contra la cadena real de migraciones en Postgres
-- desechable: aplicar la restricción antes de que el código nuevo
-- esté desplegado rompe esos flujos para cualquier usuario.
--
-- Por eso este archivo (0034) es EXCLUSIVAMENTE la fase EXPAND:
-- agrega el canal de lectura pública controlada sin tocar el acceso
-- existente. `profiles_select_all` permanece exactamente como está
-- desde 0001_init.sql — el P0 sigue abierto deliberadamente durante
-- esta fase, de forma consciente y monitoreada, no como un descuido.
--
-- La fase CONTRACT (drop de profiles_select_all + policy restrictiva
-- profiles_select_own_or_admin, que sí cierra el P0) será una
-- migración separada y posterior (0035, fuera de este PR), aplicada
-- solo después de confirmar en producción real que el código nuevo
-- (el que lee de public_profiles) es el único código sirviendo
-- tráfico — nunca antes.
--
-- Postgres RLS es row-level, no column-level: ninguna policy puede
-- "ocultar solo phone" fila por fila sin ocultar la fila entera. Por
-- eso el cierre definitivo del P0 (CONTRACT) seguirá requiriendo
-- restringir profiles_select_all a auth.uid() = id OR admin —
-- exactamente el mismo patrón ya usado en profiles_update_own,
-- profiles_delete_admin, jobs_update_owner_or_admin, etc. desde
-- 0001_init.sql. Ningún patrón de autorización nuevo, solo pospuesto
-- a la fase CONTRACT.
--
-- public.public_profiles proyecta EXACTAMENTE las columnas públicas y
-- nunca las sensibles. Se crea SIN `security_invoker` — a propósito:
-- si heredara la RLS de quien consulta (como sí hace
-- reporter_reports_view, 0021 — correcto ahí porque esa vista solo
-- expone filas del propio usuario), heredaría también la restricción
-- de profiles_select_all cuando esta se reemplace en CONTRACT, y
-- devolvería 0 filas para cualquier perfil de un tercero en ese
-- momento, sin importar qué columnas proyecte. Validado empíricamente
-- (no solo razonado) en una instancia Postgres 16 desechable, dos
-- veces en esta iniciativa: una vista security_invoker=true sobre una
-- tabla base con policy restrictiva no puede servir perfiles de
-- terceros — por eso esta vista usa permisos de propietario desde el
-- principio, aunque la restricción de la tabla base todavía no exista
-- en esta fase.
--
-- Migración aditiva y hacia adelante: no modifica 0001-0033. No toca
-- ninguna policy ni grant existente sobre public.profiles.
-- ============================================================

-- ------------------------------------------------------------
-- Vista de lectura pública. Proyecta únicamente columnas seguras;
-- excluye explícitamente phone, business_ruc, role, is_active,
-- district y updated_at. role/is_active se usan en el WHERE pero
-- deliberadamente no se proyectan. Solo perfiles activos y no-admin.
-- No depende de profiles_select_all para funcionar (sin
-- security_invoker) — funciona igual antes y después de CONTRACT.
-- ------------------------------------------------------------
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
    business_description
  from public.profiles
  where is_active and role <> 'admin';

comment on view public.public_profiles is
  'Proyección pública de profiles (0034, fase EXPAND): nunca expone phone, business_ruc, role, is_active, district ni updated_at. Excluye usuarios inactivos y administradores. No usar public.profiles directamente para leer el perfil de un tercero. profiles_select_all sigue activa durante esta fase — ver CONTRACT (0035, futuro) para el cierre definitivo del P0.';

-- ------------------------------------------------------------
-- Grants: la vista es de lectura pública explícita. Esta migración NO
-- toca ningún grant ni policy de public.profiles — profiles_select_all
-- permanece exactamente como en 0001_init.sql.
-- ------------------------------------------------------------
grant select on public.public_profiles to anon, authenticated;
