-- ============================================================
-- Pruebas de regresión — 0036_harden_public_profiles_grants.sql
-- (PR 27 — cierre de una superficie de escritura innecesaria sobre
-- public.public_profiles, independiente del P0 de profiles / CONTRACT)
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real — mismo patrón que
-- supabase/tests/0035_harden_profiles_select.test.sql):
--
--   createdb chamby_pr27_grants
--   psql -d chamby_pr27_grants -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_pr27_grants -c "CREATE SCHEMA auth;"
--   psql -d chamby_pr27_grants -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_pr27_grants -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_pr27_grants -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_pr27_grants -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   -- storage.buckets/storage.objects stub — este PR tampoco toca
--   -- Storage; 0003/0010/0019 lo requieren para aplicar.
--   psql -d chamby_pr27_grants -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid); CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS \$\$ SELECT string_to_array(name, '/') \$\$ LANGUAGE sql IMMUTABLE; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role; GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do
--     base=$(basename "$f")
--     [[ "$base" == 0035_* ]] && continue   # 0035 (CONTRACT) deliberadamente
--       # NO se aplica en esta corrida — espeja el estado REAL de
--       # Production hoy (0035 todavía pendiente) y demuestra que 0036 no
--       # depende de ella. 0021/0032 tienen el workaround conocido de
--       # reporter_reports_view (ver abajo).
--     [[ "$base" == 0021_* || "$base" == 0032_* ]] && \
--       psql -d chamby_pr27_grants -c "DROP VIEW IF EXISTS public.reporter_reports_view;"
--     psql -d chamby_pr27_grants -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_pr27_grants -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;"
--   -- Nota importante: el bloque de arriba re-otorga privilegios amplios
--   -- a nivel de ESQUEMA para poder probar el resto de la suite (0001-0034)
--   -- de forma realista, simulando el aprovisionamiento por defecto de
--   -- Supabase. Por eso esta suite vuelve a aplicar 0036 DESPUÉS de ese
--   -- bloque (ver más abajo) — 0036 debe "ganar" siempre como la última
--   -- palabra sobre los grants de public_profiles, exactamente como
--   -- ocurrirá en Production.
--   psql -d chamby_pr27_grants -v ON_ERROR_STOP=1 -f supabase/migrations/0036_harden_public_profiles_grants.sql
--   psql -d chamby_pr27_grants -f supabase/tests/0036_harden_public_profiles_grants.test.sql
--
-- Alcance de esta suite (PR 27): demuestra, sobre el estado REAL de
-- Production (0001-0034 aplicadas, 0035 CONTRACT todavía pendiente),
-- que public_profiles sigue existiendo con la misma definición y las
-- mismas 12 columnas de 0034, que anon/authenticated pueden seguir
-- leyéndola, que ningún rol (incluido PUBLIC y service_role) conserva
-- INSERT/UPDATE/DELETE sobre ella, y que profiles_select_all / 0035
-- permanecen sin tocar por este PR.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', '{"full_name":"Ana Worker"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000002', '{"full_name":"Beto Employer","role":"employer"}'::jsonb);

update public.profiles set phone = '111111111', city = 'Lima', category = 'Electricista'
  where id = 'c0000000-0000-4000-8000-000000000001';
update public.profiles set phone = '222222222', city = 'Lima', employer_type = 'company',
    business_name = 'Ferretería Beto', business_ruc = '20999999999'
  where id = 'c0000000-0000-4000-8000-000000000002';

-- ============================================================
-- A. EXISTENCIA — la vista sigue existiendo, con la misma forma de 0034
-- ============================================================
\echo '--- A1. public_profiles existe y es VIEW (relkind = v) (esperado: 1 fila) ---'
select relname, relkind from pg_class
  where relnamespace = 'public'::regnamespace and relname = 'public_profiles';

\echo '--- A2. Owner de la vista (informativo — debe ser quien aplicó las migraciones, p.ej. postgres) ---'
select viewowner from pg_views where schemaname = 'public' and viewname = 'public_profiles';

\echo '--- A3. Exactamente las 12 columnas esperadas (esperado: 12 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
  order by column_name;

\echo '--- A4. phone/business_ruc/role/is_active/district/updated_at siguen ausentes (esperado: 0 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
    and column_name in ('phone', 'business_ruc', 'role', 'is_active', 'district', 'updated_at');

\echo '--- A5. Definición de la vista intacta: filtra is_active y role <> admin (esperado: la cláusula WHERE aparece) ---'
select pg_get_viewdef('public.public_profiles'::regclass, true) as viewdef;

-- ============================================================
-- B. SELECT — la lectura pública sigue funcionando
-- ============================================================
set role anon;
\echo '--- B1. ANON puede leer public_profiles (esperado: 1 fila, sin phone) ---'
select id, full_name, city, category from public.public_profiles
  where id = 'c0000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', false);
\echo '--- B2. AUTHENTICATED puede leer public_profiles de un tercero (esperado: 1 fila, sin business_ruc) ---'
select id, full_name, city, business_name from public.public_profiles
  where id = 'c0000000-0000-4000-8000-000000000002';
reset role;

\echo '--- B3. has_table_privilege: anon SELECT = true ---'
select has_table_privilege('anon', 'public.public_profiles', 'SELECT') as anon_select;
\echo '--- B4. has_table_privilege: authenticated SELECT = true ---'
select has_table_privilege('authenticated', 'public.public_profiles', 'SELECT') as authenticated_select;

-- ============================================================
-- C. ESCRITURA — ningún rol conserva DML sobre la vista
-- ============================================================
\echo '--- C1. Privilegios efectivos por rol (esperado: SELECT=true, resto=false para anon/authenticated/service_role) ---'
select
  r.rolname,
  has_table_privilege(r.rolname, 'public.public_profiles', 'SELECT') as can_select,
  has_table_privilege(r.rolname, 'public.public_profiles', 'INSERT') as can_insert,
  has_table_privilege(r.rolname, 'public.public_profiles', 'UPDATE') as can_update,
  has_table_privilege(r.rolname, 'public.public_profiles', 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
order by r.rolname;

\echo '--- C2. Intento real de INSERT como anon (esperado: ERROR permission denied) ---'
set role anon;
insert into public.public_profiles (id, full_name) values ('c0000000-0000-4000-8000-000000000009', 'Intruso');
reset role;

-- ============================================================
-- D. PUBLIC — sin privilegios heredados/concedidos a PUBLIC
-- ============================================================
\echo '--- D1. Grants explícitos sobre public_profiles (esperado: solo SELECT para anon/authenticated/service_role, ninguna fila para PUBLIC) ---'
select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'public_profiles'
  order by grantee, privilege_type;

\echo '--- D2. has_table_privilege: PUBLIC INSERT/UPDATE/DELETE (esperado: false, false, false) ---'
select
  has_table_privilege('public', 'public.public_profiles', 'INSERT') as public_insert,
  has_table_privilege('public', 'public.public_profiles', 'UPDATE') as public_update,
  has_table_privilege('public', 'public.public_profiles', 'DELETE') as public_delete;

-- ============================================================
-- E. REGRESIÓN — 0035, profiles_select_all y el resto no se ven afectados
-- ============================================================
\echo '--- E1. profiles_select_all SIGUE existiendo (0035 deliberadamente no aplicada en esta corrida, espeja Production hoy) (esperado: 1 fila, using=true) ---'
select policyname, cmd, qual from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_all';
\echo '--- E1b. profiles_select_own_or_admin (CONTRACT, 0035) NO existe en esta corrida (esperado: 0 filas) ---'
select count(*) as debe_ser_cero from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own_or_admin';

\echo '--- E2. 0036 no modificó ninguna policy de profiles (esperado: mismo set que 0001/0034 ya tenían) ---'
select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
  order by policyname;

\echo '--- E3. public_profiles sigue siendo consultable de punta a punta (esperado: 1 fila) ---'
select count(*) from public.public_profiles;
