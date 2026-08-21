-- ============================================================
-- Pruebas de regresión — 0035_harden_profiles_select.sql
-- (fase CONTRACT — PR 26, cierre del P0 de exposición de PII en
-- public.profiles, segunda mitad de la estrategia EXPAND → DEPLOY →
-- CONTRACT iniciada en 0034 / PR #25)
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real — mismo patrón que
-- supabase/tests/0034_harden_profiles_public_access.test.sql):
--
--   createdb chamby_pr26_contract
--   psql -d chamby_pr26_contract -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_pr26_contract -c "CREATE SCHEMA auth;"
--   psql -d chamby_pr26_contract -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_pr26_contract -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_pr26_contract -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_pr26_contract -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   -- storage.buckets/storage.objects stub — igual que en 0034, este
--   -- PR tampoco toca Storage; 0003/0010/0019 lo requieren para aplicar.
--   psql -d chamby_pr26_contract -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid); CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS \$\$ SELECT string_to_array(name, '/') \$\$ LANGUAGE sql IMMUTABLE; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role; GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0035, EN ORDEN
--     psql -d chamby_pr26_contract -v ON_ERROR_STOP=1 -f "$f"
--   done
--   -- Nota: 0021 y 0032 reemplazan reporter_reports_view reordenando
--   -- columnas — CREATE OR REPLACE VIEW no lo permite (limitación de
--   -- Postgres, preexistente, no relacionada con profiles/CONTRACT):
--   --   psql -d chamby_pr26_contract -c "DROP VIEW IF EXISTS public.reporter_reports_view;"
--   -- y se reintenta ese único archivo.
--   psql -d chamby_pr26_contract -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;"
--   psql -d chamby_pr26_contract -f supabase/tests/0035_harden_profiles_select.test.sql
--
-- Alcance de esta suite (fase CONTRACT, PR 26): demuestra que
-- profiles_select_all fue eliminada, que profiles_select_own_or_admin
-- la reemplaza, que terceros ya NO pueden leer public.profiles
-- directamente (ni anon ni authenticated), que el propio usuario y el
-- admin siguen teniendo acceso completo, que public_profiles (0034)
-- sigue funcionando sin cambios, y que los flujos de escritura/otras
-- tablas no se ven afectados.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', '{"full_name":"Ana Worker"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000002', '{"full_name":"Beto Employer","role":"employer"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000003', '{"full_name":"Carla Admin"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000004', '{"full_name":"Dario Inactivo"}'::jsonb);

update public.profiles set phone = '111111111', city = 'Lima', category = 'Electricista'
  where id = 'b0000000-0000-4000-8000-000000000001';
update public.profiles set phone = '222222222', city = 'Lima', employer_type = 'company',
    business_name = 'Ferretería Beto', business_ruc = '20999999999', district = 'Miraflores'
  where id = 'b0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin', phone = '333333333' where id = 'b0000000-0000-4000-8000-000000000003';
update public.profiles set phone = '444444444', is_active = false where id = 'b0000000-0000-4000-8000-000000000004';

-- ============================================================
-- E. Estado de policies tras CONTRACT (16-18)
-- ============================================================
\echo '--- E16. profiles_select_all fue eliminada (esperado: 0 filas) ---'
select count(*) as debe_ser_cero from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_all';

\echo '--- E17. profiles_select_own_or_admin existe, cmd=SELECT (esperado: 1 fila) ---'
select policyname, cmd, qual from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own_or_admin';

\echo '--- E18. otras policies de profiles (insert/update/delete) no fueron tocadas (esperado: las mismas de 0001, sin cambios en qual/with_check) ---'
select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
  order by policyname;

-- ============================================================
-- A. OWNER — el propio usuario mantiene acceso completo (1-4)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', false);
\echo '--- A1. WORKER A lee su propio profiles completo, incl. phone (esperado: 1 fila con phone) ---'
select id, full_name, phone from public.profiles where id = 'b0000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', false);
\echo '--- A2. EMPLOYER B lee su propio profiles completo, incl. business_ruc (esperado: 1 fila con business_ruc) ---'
select id, full_name, business_ruc from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
\echo '--- A3. EMPLOYER B puede hacer SELECT * de su propia fila sin restricción de columnas (esperado: 1 fila completa) ---'
select * from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', false);
\echo '--- A4. Usuario inactivo (Dario) puede leer su propio profiles aunque is_active=false (esperado: 1 fila, is_active=false, phone visible) ---'
select id, full_name, phone, is_active from public.profiles where id = 'b0000000-0000-4000-8000-000000000004';
reset role;

-- ============================================================
-- B. TERCERO — acceso denegado tras CONTRACT (5-8)
-- ============================================================
set role anon;
\echo '--- B5. ANON ya NO puede leer profiles de nadie directamente (esperado: 0 filas) ---'
select id, phone, business_ruc from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
\echo '--- B6. ANON: SELECT * sobre toda la tabla (esperado: 0 filas) ---'
select count(*) as debe_ser_cero from public.profiles;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', false);
\echo '--- B7. WORKER A (authenticated) ya NO puede leer profiles de EMPLOYER B, tercero (esperado: 0 filas) ---'
select id, phone, business_ruc from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
\echo '--- B8. WORKER A: el embed legacy profiles!fkey de un tercero ya no expone datos (simulado como SELECT directo, esperado: 0 filas) ---'
select id, full_name, avatar_url, city from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
reset role;

-- ============================================================
-- C. ADMIN — acceso completo, propio y de terceros (9-10)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', false);
\echo '--- C9. ADMIN lee su propio profiles (esperado: 1 fila) ---'
select id, full_name, phone from public.profiles where id = 'b0000000-0000-4000-8000-000000000003';
\echo '--- C10. ADMIN lee profiles completo de TODOS los usuarios, incl. phone/business_ruc de terceros (esperado: 4 filas) ---'
select id, full_name, phone, business_ruc, is_active from public.profiles order by full_name;
reset role;

-- ============================================================
-- D. PROYECCIÓN PÚBLICA — public_profiles (0034) sigue funcionando
-- sin cambios tras CONTRACT (11-15)
-- ============================================================
set role anon;
\echo '--- D11. ANON via public_profiles: worker activo visible sin phone (esperado: 1 fila, datos públicos) ---'
select id, full_name, city, category from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000001';
\echo '--- D12. ANON via public_profiles: employer activo visible sin business_ruc (esperado: 1 fila, datos públicos) ---'
select id, full_name, city, business_name from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000002';
\echo '--- D13. ANON via public_profiles: admin NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000003';
\echo '--- D14. ANON via public_profiles: usuario inactivo NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'b0000000-0000-4000-8000-000000000004';
\echo '--- D15. public_profiles sigue estructuralmente incapaz de proyectar phone (esperado: ERROR column does not exist, no 0 filas) ---'
select phone from public.public_profiles limit 1;
reset role;

-- ============================================================
-- F. REGRESIÓN — otros flujos no afectados por CONTRACT (19-22)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', false);
\echo '--- F19. EMPLOYER B puede seguir actualizando su propio profiles (profiles_update_own, no tocada por 0035) (esperado: UPDATE 1, business_ruc nuevo) ---'
update public.profiles set business_ruc = '20111111111' where id = 'b0000000-0000-4000-8000-000000000002';
select business_ruc from public.profiles where id = 'b0000000-0000-4000-8000-000000000002';
reset role;

set role service_role;
\echo '--- F20. service_role sigue leyendo profiles de cualquiera vía BYPASSRLS, no depende de esta policy (esperado: 4 filas completas) ---'
select id, full_name, phone, business_ruc from public.profiles order by full_name;
reset role;

\echo '--- F21. current_user_role() sigue existiendo y es security definer (esperado: 1 fila, prosecdef=true) ---'
select proname, prosecdef from pg_proc where proname = 'current_user_role';

set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', false);
\echo '--- F22. jobs sigue siendo legible por cualquier authenticated (jobs_select_all, tabla distinta, no tocada por 0035) (esperado: 0 o más filas, sin error) ---'
select count(*) from public.jobs;
reset role;
