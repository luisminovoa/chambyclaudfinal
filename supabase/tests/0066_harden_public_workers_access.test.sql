-- ============================================================
-- Pruebas de regresión — 0066_harden_public_workers_access.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero). Consulta los
-- catálogos reales (pg_class, pg_attribute, aclexplode, pg_policies) y
-- ejerce los roles reales con `set role` + `request.jwt.claim.sub`, igual
-- que 0008, 0048, 0063, 0064 y 0065. No simula ninguna autenticación propia:
-- usa el auth.uid() y las tablas user_roles/profiles de las migraciones.
--
-- Qué demuestra: public_workers (vista definer, SELECT solo authenticated)
-- devuelve filas únicamente a quien posee un rol employer/admin ACTIVO en
-- user_roles, y únicamente trabajadores activos con rol worker ACTIVO.
-- auth.uid() se evalúa correctamente dentro de la vista definer.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real — la prueba siembra usuarios y datos): mismo harness que
-- 0061-0065 — roles anon/authenticated/service_role, esquema auth simulado,
-- privilegios por defecto de Supabase ANTES de las migraciones, migraciones
-- 0001-0066 con 0056 y 0059 omitidas. service_role con BYPASSRLS.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0066_harden_public_workers_access.test.sql
--
-- Las "mutaciones" (versiones rotas de la vista que esta prueba debe
-- rechazar) se ejecutan desde el harness, no desde este archivo.
-- ============================================================
\set ON_ERROR_STOP on

create schema if not exists tap;

create or replace function tap.expect_error(
  p_role text, p_sub text, p_sql text, p_sqlstate text, p_msg_like text
) returns void language plpgsql as $$
declare
  v_ok boolean := false;
  v_state text;
  v_msg text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
    execute format('set local role %I', p_role);
    execute p_sql;
    v_ok := true;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  execute 'reset role';
  if v_ok then
    raise exception 'ASSERT FALLO: se esperaba error % y la sentencia tuvo exito: %', p_sqlstate, p_sql;
  end if;
  if v_state <> p_sqlstate or v_msg not like p_msg_like then
    raise exception 'ASSERT FALLO: error distinto. obtenido [%] "%", esperado [%] "%". SQL: %', v_state, v_msg, p_sqlstate, p_msg_like, p_sql;
  end if;
end $$;

-- Devuelve, ordenados, los nombres (primer token de full_name) de los trabajadores de la SEMILLA que el rol/usuario ve en public_workers.
create or replace function tap.ids(p_role text, p_sub text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  execute format('set local role %I', p_role);
  execute $q$select coalesce(string_agg(split_part(full_name, ' ', 1), ',' order by full_name), '(0 filas)')
               from public.public_workers where id::text like 'fc000000-%'$q$ into v;
  execute 'reset role';
  return v;
exception when others then
  execute 'reset role';
  raise;
end $$;

-- ===== 0. Precondiciones del entorno =====
do $$ begin
  assert to_regclass('public.public_workers') is not null, 'PRECONDICION: falta public.public_workers';
  assert to_regclass('public.rating_summary') is not null and to_regclass('public.ratings') is not null, 'PRECONDICION: faltan rating_summary/ratings';
  assert to_regclass('public.user_roles') is not null, 'PRECONDICION: falta public.user_roles';
  assert exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'service_role'),
    'PRECONDICION: faltan los roles anon/authenticated/service_role';
end $$;

-- ===== 1. Catalogo: owner postgres, vista definer, columnas exactas =====
do $$
declare v_cols text; v_opts text[]; v_def text;
begin
  assert (select relkind from pg_class where oid = 'public.public_workers'::regclass) = 'v', '1a public_workers es una VISTA';
  assert (select pg_get_userbyid(relowner) from pg_class where oid = 'public.public_workers'::regclass) = 'postgres', '1b owner = postgres';
  select reloptions into v_opts from pg_class where oid = 'public.public_workers'::regclass;
  assert v_opts is null or not (v_opts::text like '%security_invoker%'), '2 la vista es SECURITY DEFINER (sin security_invoker)';
  assert v_opts is null or not (v_opts::text like '%security_barrier%'), '2b la vista conserva sus opciones (sin security_barrier nuevo): ' || coalesce(v_opts::text, 'NULL');
  assert not (select relrowsecurity from pg_class where oid = 'public.public_workers'::regclass), '2c la vista no tiene RLS propio';
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.public_workers'::regclass and a.attnum > 0 and not a.attisdropped;
  assert v_cols = 'id:uuid, full_name:text, avatar_url:text, city:text, category:text, skills:text[], bio:text, created_at:timestamp with time zone, professional_title:text, availability:availability_status, years_experience:integer, hourly_rate:numeric(10,2), daily_rate:numeric(10,2), department:text, province:text, district:text',
    '3 columnas EXACTAS (16, mismo orden y tipos): ' || v_cols;
  v_def := pg_get_viewdef('public.public_workers'::regclass);
  assert v_def like '%auth.uid()%' and v_def like '%user_roles%' and v_def like '%employer%' and v_def like '%admin%',
    '3b la definicion comprueba al llamador (auth.uid + user_roles employer/admin)';
end $$;

-- ===== 4. Grants EXACTOS (no cambian): solo authenticated SELECT; anon, service_role y PUBLIC sin nada =====
do $$
declare v_priv text; v_role text;
begin
  assert (select string_agg(distinct case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, ',' order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end)
            from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where c.oid = 'public.public_workers'::regclass) = 'authenticated,postgres',
    '4a grantees de public_workers: solo owner y authenticated';
  assert (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a
           where c.oid = 'public.public_workers'::regclass and a.grantee = (select oid from pg_roles where rolname = 'authenticated')) = 'SELECT',
    '4b authenticated tiene SOLO SELECT';
  foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    assert not has_table_privilege('anon', 'public.public_workers', v_priv), '4c anon NO debe tener ' || v_priv;
    assert not has_table_privilege('service_role', 'public.public_workers', v_priv), '4d service_role NO debe tener ' || v_priv;
    assert not has_table_privilege('public', 'public.public_workers', v_priv), '4e PUBLIC NO debe tener ' || v_priv;
    if v_priv <> 'SELECT' then
      assert not has_table_privilege('authenticated', 'public.public_workers', v_priv), '4f authenticated NO debe tener ' || v_priv;
    end if;
  end loop;
  assert has_table_privilege('authenticated', 'public.public_workers', 'SELECT'), '4g authenticated SI tiene SELECT';
end $$;

-- ===== Semilla (como superusuario, mismo patron que 0048/0064/0065) =====
-- NOTA: prevent_zero_active_roles exige >=1 rol activo al terminar cada sentencia:
--       primero se AGREGA el rol nuevo y despues se desactiva el otro.
insert into auth.users (id, raw_user_meta_data) values
  ('fc000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"WA trabajador activo"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"WB trabajador activo sin detalles"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"WG trabajador INACTIVO"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"WF worker SIN rol worker activo"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000005', '{"role":"employer","full_name":"EA employer puro"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000006', '{"role":"worker","full_name":"AD admin"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000007', '{"role":"worker","full_name":"DU dual employer+worker (modo worker)"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000008', '{"role":"worker","full_name":"EI worker con rol employer INACTIVO"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000009', '{"role":"worker","full_name":"AI worker con rol admin INACTIVO"}'::jsonb),
  ('fc000000-0000-4000-8000-00000000000a', '{"role":"worker","full_name":"DE dual employer+worker (modo employer)"}'::jsonb);
-- datos PRIVADOS de WA: no deben salir nunca por la vista
update public.profiles set phone = 'SECRETO-PHONE', business_ruc = 'SECRETO-RUC', bio = 'Gasfitero', city = 'Lima', category = 'Gasfitero',
       department = 'Lima', province = 'Lima', district = 'Miraflores'
 where id = 'fc000000-0000-4000-8000-000000000001';
insert into public.worker_profile_details (profile_id, professional_title, district, address, birth_date, whatsapp, availability, hourly_rate, daily_rate, years_experience)
values ('fc000000-0000-4000-8000-000000000001', 'Gasfitero certificado', 'SECRETO-DISTRITO-LIBRE', 'SECRETO-DIRECCION', '1990-05-17', 'SECRETO-WHATSAPP', 'inmediata', 35.00, 250.00, 10);
update public.profiles set is_active = false where id = 'fc000000-0000-4000-8000-000000000003';                                   -- WG inactivo
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-000000000004', 'employer', true);       -- WF: employer activo...
update public.user_roles set active = false where user_id = 'fc000000-0000-4000-8000-000000000004' and role = 'worker';          -- ...y rol worker DESACTIVADO (modo sigue 'worker')
update public.profiles set role = 'admin' where id = 'fc000000-0000-4000-8000-000000000006';                                      -- AD admin
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-000000000006', 'admin', true);
update public.user_roles set active = false where user_id = 'fc000000-0000-4000-8000-000000000006' and role = 'worker';
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-000000000007', 'employer', true);       -- DU worker+employer activos, modo worker
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-000000000008', 'employer', false);      -- EI rol employer INACTIVO
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-000000000009', 'admin', false);         -- AI rol admin INACTIVO
insert into public.user_roles (user_id, role, active) values ('fc000000-0000-4000-8000-00000000000a', 'employer', true);       -- DE worker+employer activos...
update public.profiles set role = 'employer' where id = 'fc000000-0000-4000-8000-00000000000a';                                   -- ...pero en modo employer: NO es fila del directorio (p.role = 'worker' se conserva)

-- ===== 5-6. anon y service_role: 42501 (siguen sin acceso) =====
select tap.expect_error('anon', null, 'select count(*) from public.public_workers', '42501', 'permission denied for view public_workers');
select tap.expect_error('anon', null, 'select id from public.public_workers', '42501', 'permission denied for view public_workers');
select tap.expect_error('service_role', null, 'select count(*) from public.public_workers', '42501', 'permission denied for view public_workers');
select tap.expect_error('service_role', null, 'select id from public.public_workers', '42501', 'permission denied for view public_workers');

-- ===== 7-9. Llamadores con employer/admin ACTIVO VEN a los trabajadores activos con rol worker activo =====
-- esperado: WA, WB (activos), DU (dual), EI y AI (trabajadores activos; su OTRO rol esta inactivo solo importa como LLAMADOR).
-- NO esperados: WG (inactivo), WF (sin rol worker activo), EA (employer), AD (admin).
do $$
declare v_expected constant text := 'AI,DU,EI,WA,WB';
begin
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000005') = v_expected, '7 employer activo (EA) ve el directorio: ' || tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000005');
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000006') = v_expected, '8 admin (AD) ve el directorio: ' || tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000006');
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000007') = v_expected, '9 dual employer+worker (DU) ve el directorio: ' || tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000007');
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000004') = v_expected, '9b WF (employer activo, modo worker) tambien lo ve: ' || tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000004');
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-00000000000a') = v_expected, '9b2 DE (dual, modo employer) ve el directorio: ' || tap.ids('authenticated', 'fc000000-0000-4000-8000-00000000000a');
end $$;

-- ===== 10-12. Llamadores SIN employer/admin activo: 0 filas (no error) =====
do $$ begin
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000001') = '(0 filas)', '10a worker puro (WA) -> 0 filas';
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000002') = '(0 filas)', '10b worker puro (WB) -> 0 filas';
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000003') = '(0 filas)', '11a worker inactivo como llamador (WG) -> 0 filas';
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000008') = '(0 filas)', '12a rol employer INACTIVO (EI) -> 0 filas';
  assert tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000009') = '(0 filas)', '12b rol admin INACTIVO (AI) -> 0 filas';
  assert tap.ids('authenticated', '') = '(0 filas)', '11b authenticated sin sub (auth.uid() NULL) -> 0 filas';
  assert tap.ids('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff') = '(0 filas)', '11c usuario inexistente -> 0 filas';
end $$;

-- ===== 13-15. Quien aparece como FILA =====
do $$
declare v text := tap.ids('authenticated', 'fc000000-0000-4000-8000-000000000005');
begin
  assert v like '%WA%' and v like '%WB%' and v like '%DU%', '15 trabajador activo con rol worker activo aparece (WA, WB, DU): ' || v;
  assert v not like '%WG%', '13 trabajador inactivo (WG) NO aparece';
  assert v not like '%WF%', '14 trabajador SIN rol worker activo (WF) NO aparece';
  assert v not like '%EA%' and v not like '%AD%', '14b employer (EA) y admin (AD) NO aparecen como filas';
  assert v not like '%DE%', '14c un dual en modo employer (DE) NO aparece como fila: se conserva p.role = ''worker'' (comportamiento existente)';
  -- el LEFT JOIN se conserva: WB no tiene worker_profile_details y aparece igual
  assert v like '%WB%', '15b trabajador sin worker_profile_details aparece (LEFT JOIN intacto)';
end $$;

-- ===== 9c. auth.uid() DENTRO de la vista definer: en UNA sesion, cambiar de usuario cambia el resultado =====
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.public_workers where id::text like 'fc000000-%') = 5, '9c employer: 5 filas en la sesion actual';
end $$;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', false);
do $$ begin
  assert (select count(*) from public.public_workers where id::text like 'fc000000-%') = 0, '9d worker puro: 0 filas en LA MISMA sesion tras cambiar el sub';
end $$;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000006', false);
do $$ begin
  assert (select count(*) from public.public_workers where id::text like 'fc000000-%') = 5, '9e admin: 5 filas tras cambiar el sub otra vez';
  assert auth.uid() = 'fc000000-0000-4000-8000-000000000006'::uuid, '9f auth.uid() refleja al usuario que consulta';
end $$;
reset role;

-- ===== 16. Columnas privadas NO expuestas =====
do $$
declare v_cols text[]; v_row text;
begin
  select array_agg(attname::text) into v_cols from pg_attribute where attrelid = 'public.public_workers'::regclass and attnum > 0 and not attisdropped;
  assert not (v_cols && array['phone','business_ruc','whatsapp','birth_date','address','role','is_active','updated_at','employer_type','business_name','business_sector','business_description','work_radius_km','languages']),
    '16a la vista no contiene columnas privadas: ' || array_to_string(v_cols, ',');
  -- como employer, la fila de WA no contiene ningun valor privado sembrado
  perform set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000005', true);
  execute 'set local role authenticated';
  select row_to_json(w)::text into v_row from public.public_workers w where id = 'fc000000-0000-4000-8000-000000000001';
  execute 'reset role';
  assert v_row is not null and v_row like '%Gasfitero certificado%' and v_row like '%Miraflores%', '16b la fila de WA se ve con sus columnas publicas';
  assert v_row not like '%SECRETO%', '16c ningun valor privado (phone, ruc, whatsapp, direccion, distrito libre) aparece en la fila: ' || v_row;
end $$;
select tap.expect_error('authenticated', 'fc000000-0000-4000-8000-000000000005', 'select phone from public.public_workers', '42703', 'column "phone" does not exist');
select tap.expect_error('authenticated', 'fc000000-0000-4000-8000-000000000005', 'select whatsapp from public.public_workers', '42703', 'column "whatsapp" does not exist');
select tap.expect_error('authenticated', 'fc000000-0000-4000-8000-000000000005', 'select birth_date, address from public.public_workers', '42703', 'column "birth_date" does not exist');
-- la vista definer no abre las tablas base: el employer sigue sin poder leer profiles/worker_profile_details de un tercero
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.profiles where id = 'fc000000-0000-4000-8000-000000000001') = 0, '16d el employer NO lee profiles de WA directamente';
  assert (select count(*) from public.worker_profile_details where profile_id = 'fc000000-0000-4000-8000-000000000001') = 0, '16e el employer NO lee worker_profile_details de WA directamente';
end $$;
reset role;

-- ===== 18. rating_summary NO cambia =====
do $$
declare v_cols text; v_opts text[];
begin
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.rating_summary'::regclass and a.attnum > 0 and not a.attisdropped;
  assert v_cols = 'profile_id:uuid, average_score:numeric, total_ratings:bigint', '18a columnas de rating_summary: ' || v_cols;
  select reloptions into v_opts from pg_class where oid = 'public.rating_summary'::regclass;
  assert v_opts is null or not (v_opts::text like '%security_invoker%'), '18b rating_summary sigue siendo definer';
  assert pg_get_viewdef('public.rating_summary'::regclass) like '%GROUP BY%', '18c rating_summary sigue agregando por rated_id';
  assert (select relowner from pg_class where oid = 'public.rating_summary'::regclass) = (select relowner from pg_class where oid = 'public.ratings'::regclass), '18d rating_summary conserva su owner';
  assert has_table_privilege('anon', 'public.rating_summary', 'SELECT') and has_table_privilege('authenticated', 'public.rating_summary', 'SELECT'),
    '18e anon y authenticated conservan SELECT sobre rating_summary';
end $$;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin perform count(*) from public.rating_summary; end $$;   -- anon sigue leyendo la vista publica de reputacion
reset role;

-- ===== 19. ratings NO cambia (estado de 0064/0065) =====
do $$
declare v_priv text;
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ratings') = 2, '19a ratings sigue con exactamente 2 policies';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_select_own_or_admin' and roles = array['authenticated']::name[] and cmd = 'SELECT'), '19b ratings_select_own_or_admin intacta';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_insert_participant' and cmd = 'INSERT'), '19c ratings_insert_participant intacta';
  foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    assert not has_table_privilege('anon', 'public.ratings', v_priv), '19d anon sigue sin ' || v_priv || ' sobre ratings (0064/0065)';
    assert has_table_privilege('authenticated', 'public.ratings', v_priv), '19e authenticated conserva ' || v_priv || ' sobre ratings';
  end loop;
end $$;
select tap.expect_error('anon', null, 'select count(*) from public.ratings', '42501', 'permission denied for table ratings');

select 'TODOS LOS ASSERT DE 0066 PASARON' as resultado;
