-- ============================================================
-- Pruebas de regresión — 0009_fix_v1_role_escalation.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra el
-- proyecto Supabase real):
--
--   createdb chamby_audit
--   psql -d chamby_audit -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_audit -c "CREATE SCHEMA auth;"
--   psql -d chamby_audit -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_audit -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_audit -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_audit -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0001*.sql ... supabase/migrations/0008*.sql; do
--     psql -d chamby_audit -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_audit -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   psql -d chamby_audit -v ON_ERROR_STOP=1 -f supabase/migrations/0009_fix_v1_role_escalation.sql
--   psql -d chamby_audit -f supabase/tests/0009_fix_v1_role_escalation.test.sql
--
-- N1-N2 deben terminar en ERROR o "UPDATE 0" (rechazo). P1-P3 deben
-- terminar en UPDATE 1 (aceptado). R1 es un residuo documentado, NO
-- corregido en este fix (ver docs/SECURITY_AUDIT_v0.8.md) — se deja
-- explícito para que quede visible y no se confunda con un descuido.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', '{"role":"worker","full_name":"Worker Atacante"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', '{"role":"worker","full_name":"Worker Ajeno"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000003', '{"role":"admin","full_name":"AdminReal"}'::jsonb);
update public.profiles set role = 'admin' where id = 'd0000000-0000-0000-0000-000000000003';

-- ============================================================
-- N1: un worker NO puede escalar su propio role a 'admin' (V1)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'admin' where id = auth.uid();
reset role;

-- ============================================================
-- N2: un worker NO puede tocar el perfil de otro usuario
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set full_name = 'Hackeado'
  where id = 'd0000000-0000-0000-0000-000000000002';
reset role;

-- ============================================================
-- P1: admin real SÍ puede promover a otro usuario a admin
--     (changeUserRole, src/lib/actions/admin.ts)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000003';
update public.profiles set role = 'admin' where id = 'd0000000-0000-0000-0000-000000000002';
reset role;
update public.profiles set role = 'worker' where id = 'd0000000-0000-0000-0000-000000000002';

-- ============================================================
-- P2: admin real SÍ puede suspender/reactivar una cuenta
--     (toggleUserActive, src/lib/actions/admin.ts)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000003';
update public.profiles set is_active = false where id = 'd0000000-0000-0000-0000-000000000001';
reset role;

-- ============================================================
-- P3: un worker SÍ puede alternar su propio role entre worker/employer
--     (capacidad ya prevista por el enum de profiles.role; hoy sin
--     Server Action propia en esta rama, pero la policy debe seguir
--     permitiéndolo — no es parte de V1 y no debe romperse)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
update public.profiles set role = 'employer' where id = auth.uid();
reset role;

-- ============================================================
-- R1 (residuo documentado, NO corregido aquí): un worker suspendido
-- por admin puede reactivarse a sí mismo directamente (is_active).
-- Fuera del alcance de V1 (que es únicamente role='admin'); PR #15
-- lo resolvía junto con user_roles, pero user_roles no existe en esta
-- rama. Se deja como hallazgo abierto en docs/SECURITY_AUDIT_v0.8.md,
-- NO como una prueba que deba pasar — hoy termina en UPDATE 1 (éxito),
-- lo cual es el comportamiento actual sin cambios por este commit.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set is_active = true where id = auth.uid();
reset role;
