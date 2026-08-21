-- ============================================================
-- CHAMBY — profiles: CONTRACT (cierre del P0) — Fase 2 de 2 del
-- hardening de exposición de PII en public.profiles
--
-- Contexto: 0034_harden_profiles_public_access.sql (fase EXPAND,
-- PR #25, ya aplicada en Production) introdujo public.public_profiles
-- como canal de lectura pública controlada, dejando deliberadamente
-- "profiles_select_all" (0001_init.sql:220-223, `using (true)`)
-- intacta para no romper el código todavía desplegado que dependía
-- de ella. Esta migración es esa segunda fase: una vez confirmado en
-- Production que el código que lee de public_profiles (y de
-- createAdminClient() con allowlist explícito para lecturas
-- autorizadas entre usuarios) es el único código sirviendo tráfico,
-- se retira la policy permisiva y se reemplaza por una restrictiva.
--
-- Esta migración NO modifica 0034 ni public.public_profiles, no crea
-- tablas/vistas nuevas, no toca grants, ni las policies de
-- INSERT/UPDATE/DELETE de profiles, ni ninguna otra tabla.
--
-- Postgres RLS es row-level, no column-level: no existe una policy
-- que "oculte solo phone/business_ruc" fila por fila sin ocultar la
-- fila entera. Por eso el cierre del P0 exige restringir el SELECT a
-- auth.uid() = id OR admin — el mismo patrón ya usado en
-- profiles_update_own, profiles_delete_admin,
-- jobs_update_owner_or_admin, etc. desde 0001_init.sql. Ningún
-- patrón de autorización nuevo.
--
-- Auditoría de consumidores (previa a esta migración, sin cambios de
-- código): cero consumidores Clase B encontrados. Todo el código que
-- lee perfiles de terceros ya migró a public.public_profiles o a
-- createAdminClient() con allowlist explícito en PR #25; el resto de
-- lecturas directas de public.profiles son siempre self-scoped
-- (.eq("id", user.id)) o están detrás de assertAdmin(). service_role
-- (BYPASSRLS) no depende de esta policy en ningún caso.
-- ============================================================

drop policy if exists "profiles_select_all" on public.profiles;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.current_user_role() = 'admin');
