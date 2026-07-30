-- ============================================================
-- Pruebas de regresión — 0012_rls_role_escalation_fix.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16 desechable, NUNCA contra
-- el proyecto Supabase real):
--
--   createdb chamby_audit
--   psql -d chamby_audit -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_audit -c "CREATE SCHEMA auth;"
--   psql -d chamby_audit -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_audit -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_audit -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_audit -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/000{1..9}*.sql supabase/migrations/001{0,1,2}*.sql; do
--     psql -d chamby_audit -v ON_ERROR_STOP=1 -f "$f"  # los INSERT sobre storage.buckets fallan (Storage no existe en Postgres puro) — irrelevante para profiles/user_roles, ignorar
--   done
--   psql -d chamby_audit -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   psql -d chamby_audit -f supabase/tests/0012_rls_role_escalation_fix.test.sql
--
-- Cada bloque negativo (N1-N4) debe terminar en ERROR (rechazo de RLS).
-- Cada bloque positivo (P1-P7) debe terminar en UPDATE/INSERT 1 (aceptado).
-- ============================================================

-- Fixtures
insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"role":"worker","full_name":"Atacante"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '{"role":"admin","full_name":"AdminReal"}'::jsonb);
update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';

-- ── N1: worker NO puede escalar role='admin' en profiles (debe fallar) ──────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'admin' where id = auth.uid();
reset role;

-- ── N2: worker NO puede escalar role='admin' en user_roles (debe fallar) ────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.user_roles set role = 'admin' where user_id = auth.uid();
reset role;

-- ── N3: cadena V4→V1 (forjar user_roles y usar el UPDATE que haría
--        switchRoleAction('admin') sobre profiles) — ambos pasos deben fallar ──
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.user_roles set role = 'admin' where user_id = auth.uid();
update public.profiles set role = 'admin' where id = auth.uid();
reset role;

-- ── N4: worker suspendido NO puede autorreactivarse (is_active) ────────────
update public.profiles set is_active = false where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.profiles set is_active = true where id = auth.uid();
reset role;
update public.profiles set is_active = true where id = '11111111-1111-1111-1111-111111111111';

-- ── P1: worker SÍ puede editar bio/phone/city/category/skills propios
--        (camino de updateProfile, src/lib/actions/profile.ts) ────────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.profiles
  set bio = 'Electricista con 5 años', phone = '999999999', city = 'Lima',
      category = 'Electricista', skills = array['instalaciones','mantenimiento']
  where id = auth.uid();
reset role;

-- ── P2: worker SÍ puede cambiar su propio user_roles.role entre worker/employer ──
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.user_roles set role = 'employer' where user_id = auth.uid() and role = 'worker';
reset role;

-- ── P3: disableEmployerRole — UPDATE user_roles SET active=false sin tocar role ──
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.user_roles set active = false where user_id = auth.uid() and role = 'employer';
reset role;

-- ── P4: enableEmployerRole — INSERT ... ON CONFLICT DO UPDATE (upsert) ─────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.user_roles (user_id, role, active) values (auth.uid(), 'employer', true)
  on conflict (user_id, role) do update set active = true;
reset role;

-- ── P5: admin real SÍ puede promover a otro usuario a admin
--        (camino de changeUserRole, src/lib/actions/admin.ts) ─────────────
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
reset role;

-- ── P6: admin real SÍ puede reactivar una cuenta suspendida
--        (camino de toggleUserActive, src/lib/actions/admin.ts) ───────────
update public.profiles set role = 'worker', is_active = false where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.profiles set is_active = true where id = '11111111-1111-1111-1111-111111111111';
reset role;

-- ── P7: flujo completo switchRoleAction — usuario con ambos roles activos
--        cambia su modo activo de worker a employer ──────────────────────
update public.profiles set role = 'worker' where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'employer' where id = auth.uid();
reset role;
