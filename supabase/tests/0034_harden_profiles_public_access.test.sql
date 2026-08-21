-- ============================================================
-- Pruebas de regresión — 0034_harden_profiles_public_access.sql
-- (fase EXPAND — PR #25, estrategia EXPAND → DEPLOY → CONTRACT)
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real — mismo patrón que
-- supabase/tests/0009_fix_v1_role_escalation.test.sql):
--
--   createdb chamby_pr5_expand
--   psql -d chamby_pr5_expand -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_pr5_expand -c "CREATE SCHEMA auth;"
--   psql -d chamby_pr5_expand -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_pr5_expand -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_pr5_expand -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_pr5_expand -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   -- storage.buckets/storage.objects son un stub mínimo — este PR no
--   -- toca Storage, pero 0003/0010/0019 hacen INSERT/CREATE POLICY ahí;
--   -- ver supabase/tests/README_PHASE8.md sobre por qué Storage real no
--   -- se puede probar con Postgres puro.
--   psql -d chamby_pr5_expand -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid); CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS \$\$ SELECT string_to_array(name, '/') \$\$ LANGUAGE sql IMMUTABLE; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role; GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0034, EN ORDEN
--     psql -d chamby_pr5_expand -v ON_ERROR_STOP=1 -f "$f"
--   done
--   -- Nota: 0021 y 0032 reemplazan reporter_reports_view reordenando
--   -- columnas — CREATE OR REPLACE VIEW no lo permite (limitación de
--   -- Postgres, no de la migración). Si el loop se detiene ahí:
--   --   psql -d chamby_pr5_expand -c "DROP VIEW IF EXISTS public.reporter_reports_view;"
--   -- y se reintenta ese único archivo. Preexistente, no relacionado con
--   -- profiles/0034 — no se corrige aquí (fuera de alcance de este PR).
--   psql -d chamby_pr5_expand -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;"
--   psql -d chamby_pr5_expand -f supabase/tests/0034_harden_profiles_public_access.test.sql
--
-- Alcance de esta suite (fase EXPAND, PR #25): demuestra que
-- public_profiles funciona Y que profiles_select_all sigue viva y
-- permisiva — las dos cosas a la vez, deliberadamente. La suite que
-- demuestra el cierre del P0 (profiles_select_all eliminada, acceso de
-- terceros denegado) es responsabilidad de la migración CONTRACT
-- (0035, futura, fuera de este PR) y su propio archivo de test — no
-- se simula ni se anticipa aquí.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', '{"full_name":"Ana Worker"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000002', '{"full_name":"Beto Employer","role":"employer"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000003', '{"full_name":"Carla Admin"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000004', '{"full_name":"Dario Inactivo"}'::jsonb);

update public.profiles set phone = '111111111', city = 'Lima', category = 'Electricista'
  where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set phone = '222222222', city = 'Lima', employer_type = 'company',
    business_name = 'Ferretería Beto', business_ruc = '20999999999', district = 'Miraflores'
  where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin', phone = '333333333' where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set phone = '444444444', is_active = false where id = 'a0000000-0000-4000-8000-000000000004';

-- ============================================================
-- A. La policy legacy profiles_select_all TODAVÍA existe
-- ============================================================
\echo '--- A. profiles_select_all sigue presente en pg_policies (esperado: 1 fila, using=true) ---'
select policyname, cmd, qual from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_all';

\echo '--- A2. profiles_select_own_or_admin NO existe todavía (CONTRACT no se implementó en este PR) ---'
select count(*) as debe_ser_cero from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own_or_admin';

-- ============================================================
-- B. public_profiles existe con exactamente las 12 columnas
-- aprobadas, sin PII
-- ============================================================
\echo '--- B. columnas reales de public_profiles (esperado: exactamente las 12 aprobadas, orden no importa) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
  order by column_name;

\echo '--- B2. phone/business_ruc/role/is_active/district/updated_at ausentes de la proyección (esperado: 0 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
    and column_name in ('phone', 'business_ruc', 'role', 'is_active', 'district', 'updated_at');

-- ============================================================
-- C. Exclusiones de la vista
-- ============================================================
set role anon;
\echo '--- C1. worker activo aparece en public_profiles (esperado: 1 fila) ---'
select id, full_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000001';
\echo '--- C2. employer activo aparece en public_profiles (esperado: 1 fila) ---'
select id, full_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000002';
\echo '--- C3. admin NO aparece en public_profiles, aunque is_active=true (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000003';
\echo '--- C4. usuario inactivo NO aparece en public_profiles (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000004';
reset role;

-- ============================================================
-- D. Compatibilidad con código LEGACY (origin/main) — EXPAND es
-- backward-compatible a propósito
--
-- Expected during EXPAND: legacy profiles_select_all remains
-- intentionally permissive. This assertion must be
-- removed/reversed in CONTRACT.
--
-- Estas dos consultas DEBEN devolver datos (incluida PII) durante la
-- fase EXPAND — es la prueba positiva de que el código ya desplegado
-- en origin/main (embeds `profiles!fkey`, lecturas directas de
-- terceros en /employers/[id], chat.ts, reports.ts) sigue
-- funcionando exactamente igual mientras el nuevo código de
-- public_profiles se despliega en paralelo. El P0 permanece
-- deliberadamente abierto durante esta fase — no es un fallo de esta
-- suite, es el comportamiento que EXPAND garantiza por diseño.
-- ============================================================
set role anon;
\echo '--- D1. ANON sigue pudiendo leer profiles.phone de un tercero directamente (ESPERADO EN EXPAND — P0 abierto a propósito) ---'
select id, phone, business_ruc from public.profiles where id = 'a0000000-0000-4000-8000-000000000002';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
\echo '--- D2. WORKER A (authenticated) sigue pudiendo leer profiles.phone de EMPLOYER B directamente (ESPERADO EN EXPAND) ---'
select id, phone, business_ruc from public.profiles where id = 'a0000000-0000-4000-8000-000000000002';
\echo '--- D3. Simulación del embed legacy profiles!jobs_employer_id_fkey (app/jobs/page.tsx en origin/main) — debe seguir funcionando ---'
select id, full_name, avatar_url, city from public.profiles where id = 'a0000000-0000-4000-8000-000000000002';
reset role;

-- ============================================================
-- E. Código NUEVO (PR #25) — public_profiles funciona para
-- anon/authenticated, sin PII
-- ============================================================
set role anon;
\echo '--- E1. ANON via public_profiles: permitido, sin phone/business_ruc (esperado: fila con datos públicos únicamente) ---'
select id, full_name, city, business_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000002';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
\echo '--- E2. WORKER A via public_profiles ve a EMPLOYER B sin PII (esperado: fila con datos públicos únicamente) ---'
select id, full_name, city, business_name from public.public_profiles where id = 'a0000000-0000-4000-8000-000000000002';
reset role;

\echo '--- E3. public_profiles estructuralmente incapaz de proyectar phone (esperado: ERROR column does not exist, no 0 filas) ---'
select phone from public.public_profiles limit 1;
