-- ============================================================
-- Pruebas de regresión — 0037_public_workers_directory.sql
-- (Fase 1 del directorio de trabajadores — solo fuente de datos, sin
-- UI/ruta /workers todavía; ver auditoría previa "DISEÑO DEL DIRECTORIO
-- DE TRABAJADORES PARA EMPLEADORES")
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real — mismo patrón que
-- supabase/tests/0036_harden_public_profiles_grants.test.sql):
--
--   createdb chamby_pr_workers_directory
--   psql -d chamby_pr_workers_directory -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_pr_workers_directory -c "CREATE SCHEMA auth;"
--   psql -d chamby_pr_workers_directory -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_pr_workers_directory -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_pr_workers_directory -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_pr_workers_directory -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   -- storage.buckets/storage.objects stub — este PR tampoco toca
--   -- Storage; 0003/0010/0019 lo requieren para aplicar.
--   psql -d chamby_pr_workers_directory -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid); CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS \$\$ SELECT string_to_array(name, '/') \$\$ LANGUAGE sql IMMUTABLE; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role; GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, anon;"
--   for f in $(ls supabase/migrations/*.sql | sort -V); do   # 0001 .. 0037, EN ORDEN
--     base=$(basename "$f")
--     if [[ "$base" == "0021_"* ]] || [[ "$base" == "0032_"* ]]; then
--       psql -d chamby_pr_workers_directory -c "DROP VIEW IF EXISTS public.reporter_reports_view;"
--     fi
--     psql -d chamby_pr_workers_directory -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_pr_workers_directory -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;"
--   -- 0037 se re-aplica DESPUÉS de ese bloque de grants amplios de
--   -- esquema (simula el aprovisionamiento por defecto de Supabase) —
--   -- 0037 debe "ganar" siempre como última palabra sobre sus propios
--   -- grants, igual que ya se validó para 0036.
--   psql -d chamby_pr_workers_directory -v ON_ERROR_STOP=1 -f supabase/migrations/0037_public_workers_directory.sql
--   psql -d chamby_pr_workers_directory -f supabase/tests/0037_public_workers_directory.test.sql
--
-- Alcance de esta suite: demuestra que public_workers existe con
-- exactamente las 13 columnas esperadas (nunca las sensibles), que su
-- definición hace el JOIN correcto y filtra role='worker' + is_active,
-- que combina datos de profiles + worker_profile_details (incluido el
-- caso de un worker sin fila en worker_profile_details), que solo
-- authenticated puede leerla (SELECT-only, sin DML, sin PUBLIC), y que
-- 0034/0035/0036/profiles/worker_profile_details/profile_stats/
-- rating_summary permanecen sin tocar.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001', '{"full_name":"Ana Electricista"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000002', '{"full_name":"Beto Inactivo"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000003', '{"full_name":"Carla Employer","role":"employer"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000004', '{"full_name":"Dario Admin"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000005', '{"full_name":"Eva SinDetalles"}'::jsonb);

update public.profiles set city = 'Lima', category = 'Electricista', skills = array['instalaciones', 'tableros'],
    bio = 'Electricista con experiencia residencial'
  where id = 'd0000000-0000-4000-8000-000000000001';
update public.profiles set city = 'Lima', category = 'Gasfitero', is_active = false
  where id = 'd0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'employer', city = 'Lima', employer_type = 'company', business_name = 'Ferretería Carla'
  where id = 'd0000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin', city = 'Lima'
  where id = 'd0000000-0000-4000-8000-000000000004';
update public.profiles set city = 'Chiclayo', category = 'Pintor'
  where id = 'd0000000-0000-4000-8000-000000000005';

insert into public.worker_profile_details (profile_id, professional_title, availability, years_experience, hourly_rate, daily_rate, whatsapp, birth_date, address, district)
values
  ('d0000000-0000-4000-8000-000000000001', 'Electricista industrial certificado', 'inmediata', 5, 35.00, 220.00, '51999999999', '1990-01-01', 'Av. Siempre Viva 123', 'Miraflores'),
  ('d0000000-0000-4000-8000-000000000002', 'Gasfitero residencial', 'no_disponible', 2, 25.00, null, '51988888888', '1995-05-05', 'Jr. Falso 456', 'Comas');
-- d0000000-...-005 (Eva) deliberadamente SIN fila en worker_profile_details —
-- prueba el LEFT JOIN: debe seguir apareciendo en public_workers con las
-- columnas de worker_profile_details en NULL.

-- ============================================================
-- A. EXISTENCIA
-- ============================================================
\echo '--- A1. public_workers existe y es VIEW (relkind = v) (esperado: 1 fila) ---'
select relname, relkind from pg_class
  where relnamespace = 'public'::regnamespace and relname = 'public_workers';

-- ============================================================
-- B. COLUMNAS
-- ============================================================
\echo '--- B1. Exactamente las 13 columnas esperadas (esperado: 13 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_workers'
  order by column_name;

\echo '--- B2. whatsapp/birth_date/address/district/phone/business_ruc/role/is_active ausentes (esperado: 0 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_workers'
    and column_name in ('whatsapp', 'birth_date', 'address', 'district', 'phone', 'business_ruc', 'role', 'is_active');

-- ============================================================
-- C. DEFINICIÓN
-- ============================================================
\echo '--- C1. pg_get_viewdef: usa profiles, worker_profile_details, JOIN y filtros correctos (revisión manual del texto) ---'
select pg_get_viewdef('public.public_workers'::regclass, true) as viewdef;

\echo '--- C2. La definición referencia profiles (esperado: true) ---'
select pg_get_viewdef('public.public_workers'::regclass, true) ilike '%profiles%' as menciona_profiles;
\echo '--- C3. La definición referencia worker_profile_details (esperado: true) ---'
select pg_get_viewdef('public.public_workers'::regclass, true) ilike '%worker_profile_details%' as menciona_worker_details;
\echo '--- C4. La definición filtra role = worker (esperado: true) ---'
select pg_get_viewdef('public.public_workers'::regclass, true) ilike '%worker%role%' or
       pg_get_viewdef('public.public_workers'::regclass, true) ilike '%role%worker%' as filtra_role_worker;
\echo '--- C5. La definición filtra is_active (esperado: true) ---'
select pg_get_viewdef('public.public_workers'::regclass, true) ilike '%is_active%' as filtra_is_active;

-- ============================================================
-- D. DATOS
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);

\echo '--- D1. Worker activo (Ana) aparece, con datos combinados de profiles + worker_profile_details (esperado: 1 fila completa) ---'
select id, full_name, city, category, professional_title, availability, years_experience, hourly_rate, daily_rate
  from public.public_workers where id = 'd0000000-0000-4000-8000-000000000001';

\echo '--- D2. Worker inactivo (Beto) NO aparece (esperado: 0 filas) ---'
select id from public.public_workers where id = 'd0000000-0000-4000-8000-000000000002';

\echo '--- D3. Employer (Carla) NO aparece (esperado: 0 filas) ---'
select id from public.public_workers where id = 'd0000000-0000-4000-8000-000000000003';

\echo '--- D4. Admin (Dario) NO aparece (esperado: 0 filas) ---'
select id from public.public_workers where id = 'd0000000-0000-4000-8000-000000000004';

\echo '--- D5. Worker activo SIN fila en worker_profile_details (Eva) igual aparece, columnas de detalle en NULL (esperado: 1 fila, professional_title/availability/years_experience/hourly_rate/daily_rate = NULL) ---'
select id, full_name, category, professional_title, availability, years_experience, hourly_rate, daily_rate
  from public.public_workers where id = 'd0000000-0000-4000-8000-000000000005';

\echo '--- D6. Conteo total de public_workers (esperado: 2 — Ana y Eva; Beto/Carla/Dario excluidos) ---'
select count(*) from public.public_workers;

\echo '--- D7. whatsapp/birth_date/address/district estructuralmente ausentes (esperado: ERROR column does not exist) ---'
select whatsapp from public.public_workers limit 1;

reset role;

-- ============================================================
-- E. PRIVILEGIOS
-- ============================================================
\echo '--- E1. Privilegios efectivos por rol ---'
select
  r.rolname,
  has_table_privilege(r.rolname, 'public.public_workers', 'SELECT') as can_select,
  has_table_privilege(r.rolname, 'public.public_workers', 'INSERT') as can_insert,
  has_table_privilege(r.rolname, 'public.public_workers', 'UPDATE') as can_update,
  has_table_privilege(r.rolname, 'public.public_workers', 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
order by r.rolname;
\echo '--- Esperado: authenticated SELECT=true/resto=false; anon TODO=false; service_role TODO=false (decisión deliberada: no se le concede SELECT adicional — ya tiene BYPASSRLS y acceso directo a profiles/worker_profile_details) ---'

\echo '--- E2. has_table_privilege: PUBLIC (esperado: false en los 4) ---'
select
  has_table_privilege('public', 'public.public_workers', 'SELECT') as public_select,
  has_table_privilege('public', 'public.public_workers', 'INSERT') as public_insert,
  has_table_privilege('public', 'public.public_workers', 'UPDATE') as public_update,
  has_table_privilege('public', 'public.public_workers', 'DELETE') as public_delete;

\echo '--- E3. Grants explícitos registrados (esperado: solo authenticated/SELECT como grantee no-owner) ---'
select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'public_workers'
  order by grantee, privilege_type;

\echo '--- E4. Intento real de SELECT como anon (esperado: ERROR permission denied) ---'
set role anon;
select id from public.public_workers limit 1;
reset role;

-- ============================================================
-- F. REGRESIÓN
-- ============================================================
\echo '--- F1. public_profiles sigue existiendo, sin cambios de columnas (esperado: 12 filas, mismas de 0034) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
  order by column_name;

\echo '--- F2. Policies de profiles sin cambios (esperado: mismo set de 0035) ---'
select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
  order by policyname;

\echo '--- F3. Policies de worker_profile_details sin cambios (esperado: las 3 de 0011, solo owner+admin) ---'
select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'worker_profile_details'
  order by policyname;

\echo '--- F4. Policies de profile_stats sin cambios (esperado: solo stats_select_own — 0013_harden_profile_module_rls.sql ya había retirado insert/update antes de esta migración) ---'
select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'profile_stats'
  order by policyname;

\echo '--- F5. rating_summary sigue existiendo y consultable, sin cambios (esperado: sin error) ---'
select count(*) from public.rating_summary;

\echo '--- F6. Grants de public_profiles siguen siendo los de 0036 (SELECT-only, sin regresión) ---'
select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'public_profiles'
  order by grantee, privilege_type;
