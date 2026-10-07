-- ============================================================
-- Pruebas de regresión — 0061_public_profiles_employers_only.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16/17 desechable, NUNCA contra el
-- proyecto Supabase real): mismo setup que
-- supabase/tests/0036_harden_public_profiles_grants.test.sql (roles
-- anon/authenticated/service_role, esquemas auth/storage simulados,
-- migraciones 0001-0060 en orden — 0035 y las excepciones
-- 0021/0032 según ese archivo), aplicando además
-- 0061_public_profiles_employers_only.sql al final.
--
-- NO ejecutado en la fase de implementación — este entorno de
-- desarrollo no tiene un Postgres local disponible, y ejecutarlo contra
-- Production está explícitamente prohibido. Documentado siguiendo la
-- misma convención que el resto de supabase/tests/*.test.sql.
--
-- Nota de ejecución: los bloques "Esperado: ERROR ..." fallan
-- deliberadamente; en psql sin `-v ON_ERROR_STOP=1` cada sentencia es su
-- propia transacción implícita y un error no aborta el resto del script.
--
-- Las suites 0034/0035/0036 son FOTOS HISTÓRICAS: cada una aplica las
-- migraciones solo hasta su propio estado, y siguen siendo válidas así.
-- Esta suite cubre el comportamiento NUEVO de la vista.
-- ============================================================

-- handle_new_user() (0014) crea profiles + user_roles según
-- raw_user_meta_data.role.
insert into auth.users (id, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', '{"full_name":"Worker Puro","role":"worker"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', '{"full_name":"Employer Puro","role":"employer"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', '{"full_name":"Multirol Modo Worker","role":"worker"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000004', '{"full_name":"Multirol Modo Employer","role":"employer"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000005', '{"full_name":"Admin Puro","role":"worker"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000006', '{"full_name":"Admin Mas Employer","role":"employer"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000007', '{"full_name":"Employer Inactivo","role":"employer"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000008', '{"full_name":"Perfil Inactivo","role":"employer"}'::jsonb);

-- 3: worker + employer, modo activo worker (profiles.role = 'worker')
insert into public.user_roles (user_id, role) values
  ('f1000000-0000-4000-8000-000000000003', 'employer');

-- 4: worker + employer, modo activo employer (profiles.role = 'employer')
insert into public.user_roles (user_id, role) values
  ('f1000000-0000-4000-8000-000000000004', 'worker');

-- 5: admin puro — user_roles(admin) activo, modo activo admin
insert into public.user_roles (user_id, role, active) values
  ('f1000000-0000-4000-8000-000000000005', 'admin', true);
update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000005';

-- 6: admin que además posee employer activo, en modo employer (el caso que
-- el filtro `role <> 'admin'` por sí solo NO cubría)
insert into public.user_roles (user_id, role, active) values
  ('f1000000-0000-4000-8000-000000000006', 'admin', true);

-- 7: employer con user_roles(employer).active = false (conserva un rol
-- worker activo — prevent_zero_active_roles() exige al menos uno)
insert into public.user_roles (user_id, role) values
  ('f1000000-0000-4000-8000-000000000007', 'worker');
update public.user_roles set active = false
  where user_id = 'f1000000-0000-4000-8000-000000000007' and role = 'employer';

-- 8: employer con profiles.is_active = false
update public.profiles set is_active = false where id = 'f1000000-0000-4000-8000-000000000008';

update public.profiles set phone = '999999999', business_ruc = '20999999999'
  where id in ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003');

-- ============================================================
-- A. FILTRO POR ROL — lectura como anon
-- ============================================================
set role anon;

\echo '--- A1. worker puro NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000001';

\echo '--- A2. employer aparece (esperado: 1 fila) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000002';

\echo '--- A3. worker + employer, modo activo worker, aparece (esperado: 1 fila) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000003';

\echo '--- A4. worker + employer, modo activo employer, aparece (esperado: 1 fila) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000004';

\echo '--- A5. admin puro NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000005';

\echo '--- A6. admin + employer activo, modo employer, NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000006';

\echo '--- A7. employer con user_roles.active = false NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000007';

\echo '--- A8. profile con is_active = false NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000008';

reset role;

-- A6b. variante: el mismo admin+employer con modo activo 'admin'
update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000006';
set role anon;
\echo '--- A6b. admin + employer activo, modo admin, NO aparece (esperado: 0 filas) ---'
select id, full_name from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000006';
reset role;

-- ============================================================
-- B. SIN DUPLICADOS
-- ============================================================
\echo '--- B1. ninguna fila repetida por id en la vista (esperado: 0 filas) ---'
select id, count(*) from public.public_profiles group by id having count(*) > 1;

\echo '--- B2. multirol aparece exactamente una vez (esperado: n = 1 para cada uno) ---'
select id, count(*) as n from public.public_profiles
  where id in ('f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004')
  group by id order by id;

\echo '--- B3. de los 8 usuarios de esta suite solo aparecen 3: ids 02, 03 y 04 (esperado: 3 filas) ---'
select id from public.public_profiles where id::text like 'f1000000-%' order by id;

-- ============================================================
-- C. PROYECCIÓN — sin PII, mismas 15 columnas
-- ============================================================
set role anon;
\echo '--- C1. phone no existe en la vista (esperado: ERROR column "phone" does not exist, no 0 filas) ---'
select phone from public.public_profiles limit 1;
\echo '--- C2. business_ruc no existe en la vista (esperado: ERROR column "business_ruc" does not exist) ---'
select business_ruc from public.public_profiles limit 1;
reset role;

\echo '--- C3. exactamente las 15 columnas de 0043 (esperado: 15 filas) ---'
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'
  order by ordinal_position;

-- ============================================================
-- D. GRANTS — idénticos a 0043
-- ============================================================
\echo '--- D1. privilegios por rol (esperado: SELECT=true, INSERT/UPDATE/DELETE=false para anon/authenticated/service_role) ---'
select
  r.rolname,
  has_table_privilege(r.rolname, 'public.public_profiles', 'SELECT') as can_select,
  has_table_privilege(r.rolname, 'public.public_profiles', 'INSERT') as can_insert,
  has_table_privilege(r.rolname, 'public.public_profiles', 'UPDATE') as can_update,
  has_table_privilege(r.rolname, 'public.public_profiles', 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
order by r.rolname;

\echo '--- D2. PUBLIC sin privilegios sobre la vista (esperado: 0 filas) ---'
select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'public_profiles' and grantee = 'PUBLIC';

\echo '--- D3. un INSERT como anon sigue denegado (esperado: ERROR permission denied) ---'
set role anon;
insert into public.public_profiles (id, full_name) values ('f1000000-0000-4000-8000-000000000099', 'Intruso');
reset role;

-- ============================================================
-- E. authenticated sigue viendo empleadores (descubrimiento intacto)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
\echo '--- E1. un worker autenticado ve al employer sin PII (esperado: 1 fila, business_name/city, sin phone) ---'
select id, full_name, city, business_name from public.public_profiles
  where id = 'f1000000-0000-4000-8000-000000000002';
\echo '--- E2. un worker autenticado tampoco ve a otro worker en public_profiles (esperado: 0 filas) ---'
select id from public.public_profiles where id = 'f1000000-0000-4000-8000-000000000001';
reset role;

-- ============================================================
-- F. NO se tocó RLS de profiles ni las policies de user_roles
-- ============================================================
\echo '--- F1. policies de user_roles intactas (esperado: user_roles_delete_admin, user_roles_insert_own, user_roles_select_own, user_roles_update_own) ---'
select policyname from pg_policies
  where schemaname = 'public' and tablename = 'user_roles' order by policyname;

\echo '--- F2. profiles sigue sin lectura de terceros: un worker autenticado no lee a otro (esperado: 0 filas) ---'
set role authenticated;
set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
select id from public.profiles where id = 'f1000000-0000-4000-8000-000000000002';
reset role;
