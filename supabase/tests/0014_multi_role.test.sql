-- ============================================================
-- Pruebas de regresión — 0014_multi_role.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real):
--
--   createdb chamby_multirole
--   psql -d chamby_multirole -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_multirole -c "CREATE SCHEMA auth;"
--   psql -d chamby_multirole -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_multirole -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_multirole -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_multirole -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0013, en orden
--     psql -d chamby_multirole -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_multirole -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   psql -d chamby_multirole -v ON_ERROR_STOP=1 -f supabase/migrations/0014_multi_role.sql
--   psql -d chamby_multirole -f supabase/tests/0014_multi_role.test.sql
--
-- N1-N3 deben terminar en ERROR o "UPDATE 0"/"INSERT 0" (rechazo).
-- P1-P3 deben terminar en éxito (INSERT/UPDATE/DELETE de 1 fila, o
-- SELECT con las filas esperadas).
--
-- Nota: el GRANT ALL ON ALL TABLES del setup (paso previo a aplicar
-- 0014) le da a `authenticated` privilegios de columna completos sobre
-- user_roles ANTES de que 0014 corra su propio REVOKE/GRANT — por eso
-- 0014 debe aplicarse DESPUÉS de ese GRANT ALL, igual que en
-- 0009_fix_v1_role_escalation.test.sql con profiles.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', '{"role":"worker","full_name":"Worker Atacante"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', '{"role":"worker","full_name":"Worker Ajeno"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000003', '{"role":"admin","full_name":"AdminReal"}'::jsonb);
update public.profiles set role = 'admin' where id = 'e0000000-0000-0000-0000-000000000003';

-- Backfill de 0014 ya debió crear, para cada usuario de arriba, su fila
-- correspondiente en user_roles (worker/worker/admin). Confirmamos el
-- estado de partida antes de las pruebas:
select user_id, role, active from public.user_roles order by user_id;

-- ============================================================
-- N1: un usuario NO puede reescribir su propio `role` a 'admin' vía
--     UPDATE (V4 — el hueco que tenía el intento anterior, PR #15)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
update public.user_roles set role = 'admin' where user_id = auth.uid();
reset role;

-- ============================================================
-- N2: un usuario NO puede insertarse el rol 'admin' directamente
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
reset role;

-- ============================================================
-- N3: un usuario NO puede insertar ni actualizar filas de OTRO user_id
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
insert into public.user_roles (user_id, role)
  values ('e0000000-0000-0000-0000-000000000002', 'employer');
update public.user_roles set active = false
  where user_id = 'e0000000-0000-0000-0000-000000000002';
reset role;

-- ============================================================
-- P1: un usuario SÍ puede agregarse el rol 'employer' conservando el
--     'worker' existente (enableEmployerRole), y alternar `active` de
--     un rol que ya posee (única columna con GRANT UPDATE)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
insert into public.user_roles (user_id, role) values (auth.uid(), 'employer');
update public.user_roles set active = false where user_id = auth.uid() and role = 'employer';
update public.user_roles set active = true  where user_id = auth.uid() and role = 'employer';
reset role;

-- ============================================================
-- P2: el usuario ahora posee AMBOS roles activos — ninguno se eliminó
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
select role, active from public.user_roles
  where user_id = auth.uid() order by role;
reset role;

-- ============================================================
-- P3: admin real SÍ puede borrar una fila de user_roles (moderación)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000003';
delete from public.user_roles
  where user_id = 'e0000000-0000-0000-0000-000000000002' and role = 'worker';
reset role;
