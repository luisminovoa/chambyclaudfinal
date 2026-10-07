-- ============================================================
-- Pruebas de regresión — 0063_harden_security_definer_execute.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero). Consulta los
-- catálogos reales (pg_proc, pg_event_trigger, pg_policies); no simula nada.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real): mismo harness que 0061/0062 (roles anon/authenticated/
-- service_role, esquema auth simulado, privilegios por defecto de Supabase
-- ANTES de las migraciones, migraciones 0001-0062 con 0056 y 0059 omitidas)
-- y, ADEMÁS, estos dos requisitos propios de esta prueba:
--
--  1) rls_auto_enable() y el event trigger ensure_rls son objetos de la
--     PLATAFORMA Supabase (ninguna migración de este repo los crea). El
--     harness debe crearlos DESPUÉS de 0062 y ANTES de 0063 (si existieran
--     desde el inicio, el event trigger habilitaría RLS en tablas durante el
--     replay y alteraría las migraciones anteriores).
--  2) Instantánea de las ACL de todas las funciones de public, tomada
--     inmediatamente antes de aplicar 0063:
--       create schema tap;
--       create table tap.acl_before as
--         select p.oid::regprocedure::text as sig, p.proacl::text as acl
--         from pg_proc p where p.pronamespace = 'public'::regnamespace;
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0063_harden_security_definer_execute.test.sql
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

-- ===== 0. Precondiciones del entorno (si faltan, el test falla con un mensaje claro) =====
do $$ begin
  assert to_regclass('tap.acl_before') is not null, 'PRECONDICION: falta tap.acl_before (instantanea de ACL previa a 0063)';
  assert to_regprocedure('public.current_user_role()') is not null, 'PRECONDICION: falta public.current_user_role()';
  assert to_regprocedure('public.user_has_role(user_role)') is not null, 'PRECONDICION: falta public.user_has_role(user_role)';
  assert to_regprocedure('public.rls_auto_enable()') is not null, 'PRECONDICION: falta public.rls_auto_enable()';
  assert exists (select 1 from pg_event_trigger where evtname = 'ensure_rls'), 'PRECONDICION: falta el event trigger ensure_rls';
end $$;

-- Diagnostico (informativo): ACL real de las tres funciones, tal como las ve el catalogo.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure::text as sig, coalesce(p.proacl::text, '(NULL = default)') as acl
             from pg_proc p
            where p.oid in ('public.current_user_role()'::regprocedure, 'public.user_has_role(user_role)'::regprocedure, 'public.rls_auto_enable()'::regprocedure)
            order by 1
  loop
    raise notice 'ACL % -> %', r.sig, r.acl;
  end loop;
end $$;

-- ===== 1. current_user_role(): anon NO, authenticated SI, service_role SI =====
do $$ begin
  assert not has_function_privilege('anon', 'public.current_user_role()', 'EXECUTE'), '1a anon NO debe tener EXECUTE sobre current_user_role()';
  assert has_function_privilege('authenticated', 'public.current_user_role()', 'EXECUTE'), '1b authenticated SI debe tener EXECUTE sobre current_user_role()';
  assert has_function_privilege('service_role', 'public.current_user_role()', 'EXECUTE'), '1c service_role SI debe tener EXECUTE sobre current_user_role()';
end $$;

-- ===== 2. user_has_role(user_role): anon NO, authenticated NO, service_role SI =====
do $$ begin
  assert not has_function_privilege('anon', 'public.user_has_role(user_role)', 'EXECUTE'), '2a anon NO debe tener EXECUTE sobre user_has_role()';
  assert not has_function_privilege('authenticated', 'public.user_has_role(user_role)', 'EXECUTE'), '2b authenticated NO debe tener EXECUTE sobre user_has_role()';
  assert has_function_privilege('service_role', 'public.user_has_role(user_role)', 'EXECUTE'), '2c service_role SI debe tener EXECUTE sobre user_has_role()';
end $$;

-- ===== 3. rls_auto_enable(): anon NO, authenticated NO, service_role SI =====
do $$ begin
  assert not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'), '3a anon NO debe tener EXECUTE sobre rls_auto_enable()';
  assert not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'), '3b authenticated NO debe tener EXECUTE sobre rls_auto_enable()';
  assert has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE'), '3c service_role SI debe tener EXECUTE sobre rls_auto_enable()';
end $$;

-- ===== Semilla para las pruebas funcionales =====
insert into auth.users (id, raw_user_meta_data) values
  ('f6000000-0000-4000-8000-000000000001', '{"full_name":"Trabajador","role":"worker"}'::jsonb),
  ('f6000000-0000-4000-8000-000000000002', '{"full_name":"Empleador","role":"employer"}'::jsonb),
  ('f6000000-0000-4000-8000-000000000003', '{"full_name":"Admin","role":"worker"}'::jsonb);
update public.profiles set role = 'admin' where id = 'f6000000-0000-4000-8000-000000000003';

-- ===== 4. Las policies que dependen de current_user_role() siguen funcionando para authenticated =====
do $$
declare v_policies int;
begin
  select count(*) into v_policies from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%current_user_role%';
  assert v_policies >= 30, '4a existen las policies que dependen de current_user_role(): ' || v_policies;
  assert has_function_privilege('authenticated', 'public.current_user_role()', 'EXECUTE'), '4b authenticated conserva EXECUTE';
end $$;

-- 4c. como authenticated (trabajador): la funcion y una consulta cuya policy la evalua
select set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$ begin
  assert public.current_user_role() = 'worker', '4c current_user_role() responde para authenticated';
  assert (select count(*) from public.profiles where id = 'f6000000-0000-4000-8000-000000000001') = 1, '4d profiles_select_own_or_admin se evalua y devuelve la fila propia';
  perform count(*) from public.job_applications;   -- applications_select evalua current_user_role(): no debe fallar
  perform count(*) from public.notifications;      -- notifications_select_own evalua current_user_role()
end $$;
reset role;

-- 4e. como authenticated (admin): la rama `current_user_role() = 'admin'` de la policy sigue abriendo todo
select set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000003', false);
set role authenticated;
do $$ begin
  assert public.current_user_role() = 'admin', '4e current_user_role() devuelve admin';
  assert (select count(*) from public.profiles where id::text like 'f6000000-%') = 3, '4f el admin ve los 3 perfiles via la policy que usa current_user_role()';
end $$;
reset role;

-- 4g. como authenticated (empleador): INSERT de un job — jobs_insert_employer (0062) evalua current_user_role() en su WITH CHECK
select set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$ declare v uuid; begin
  insert into public.jobs (employer_id, title, description, category, city)
  values ('f6000000-0000-4000-8000-000000000002', 'JOB-T63', 'Descripcion de prueba larga', 'Gasfitero', 'Lima')
  returning id into v;
  assert v is not null, '4g el INSERT legitimo de un job (policy con current_user_role()) sigue funcionando';
end $$;
reset role;

-- ===== 7a. Pruebas negativas/positivas de permisos reales =====
-- anon: no puede llamar a las funciones ni consultar tablas cuyas policies las evaluan (error 42501, no "0 filas")
select tap.expect_error('anon', null, 'select public.current_user_role()', '42501', 'permission denied for function current_user_role%');
select tap.expect_error('anon', null, 'select public.user_has_role(''worker''::user_role)', '42501', 'permission denied for function user_has_role%');
select tap.expect_error('anon', null, 'select public.rls_auto_enable()', '42501', 'permission denied for function rls_auto_enable%');
select tap.expect_error('anon', null, 'select count(*) from public.profiles', '42501', 'permission denied for function current_user_role%');
-- caso /employers/[id] para visitantes: el conteo de contrataciones consulta job_applications con el cliente de sesion
select tap.expect_error('anon', null, 'select count(*) from public.job_applications', '42501', 'permission denied for function current_user_role%');
-- authenticated: user_has_role y rls_auto_enable ya no se pueden invocar
select tap.expect_error('authenticated', 'f6000000-0000-4000-8000-000000000001', 'select public.user_has_role(''worker''::user_role)', '42501', 'permission denied for function user_has_role%');
select tap.expect_error('authenticated', 'f6000000-0000-4000-8000-000000000001', 'select public.rls_auto_enable()', '42501', 'permission denied for function rls_auto_enable%');

-- anon: lo que la app publica SIGUE funcionando (jobs con policy `using (true)`, vistas definer, tablas de disponibilidad)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  assert (select count(*) from public.jobs where title = 'JOB-T63') = 1, '7a anon sigue leyendo jobs (policy using true)';
  assert (select count(*) from public.public_profiles where id = 'f6000000-0000-4000-8000-000000000002') = 1, '7b anon sigue leyendo public_profiles (vista definer, empleadores)';
  perform count(*) from public.rating_summary;
  perform count(*) from public.profile_availability_slots;
  perform count(*) from public.profile_availability_exceptions;
end $$;
reset role;

-- service_role: conserva EXECUTE y puede invocar user_has_role (devuelve false/null sin sesion)
set role service_role;
do $$ begin
  assert public.user_has_role('worker'::user_role) is not true, '7c service_role puede invocar user_has_role()';
end $$;
reset role;

-- ===== 5. No se modificaron los permisos de ninguna otra funcion de public =====
do $$
declare v_changed text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_changed
    from pg_proc p
    left join tap.acl_before b on b.sig = p.oid::regprocedure::text
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('current_user_role', 'user_has_role', 'rls_auto_enable')
     and (b.sig is null or b.acl is distinct from p.proacl::text);
  assert v_changed is null, '5a otras funciones con ACL distinta a la previa: ' || coalesce(v_changed, '');
  -- y entre las 3 objetivo, SOLO cambiaron las que debian
  assert (select count(*) from pg_proc p join tap.acl_before b on b.sig = p.oid::regprocedure::text
           where p.pronamespace = 'public'::regnamespace and p.proname in ('current_user_role','user_has_role','rls_auto_enable')
             and b.acl is distinct from p.proacl::text) = 3, '5b las 3 funciones objetivo cambiaron su ACL';
  -- las demas SECURITY DEFINER conservan EXECUTE para service_role (no se toco service_role)
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
                      and not has_function_privilege('service_role', p.oid, 'EXECUTE')), '5c service_role conserva EXECUTE en todas las SECURITY DEFINER';
end $$;

-- ===== 6. El event trigger ensure_rls sigue apuntando a public.rls_auto_enable() y habilitado =====
do $$
declare e record;
begin
  select evtname, evtevent, evtenabled, evtfoid into e from pg_event_trigger where evtname = 'ensure_rls';
  assert e.evtname is not null, '6a existe el event trigger ensure_rls';
  assert e.evtfoid = 'public.rls_auto_enable()'::regprocedure, '6b ensure_rls apunta a public.rls_auto_enable()';
  assert e.evtenabled = 'O', '6c ensure_rls permanece habilitado (O): ' || e.evtenabled;
  assert e.evtevent = 'ddl_command_end', '6d ensure_rls sigue en ddl_command_end';
end $$;
-- 6e. funcional: el event trigger SIGUE disparando tras la revocacion (el DDL lo ejecuta postgres, el dueño)
create table public.tap_probe_rls (id int);
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.tap_probe_rls'::regclass), '6e el event trigger habilito RLS en una tabla nueva tras 0063';
end $$;
drop table public.tap_probe_rls;

-- ===== 8. PUBLIC ya no tiene EXECUTE y las ACL finales son exactamente las esperadas =====
-- (revocar solo de anon/authenticated dejaria el acceso efectivo via PUBLIC: grantee 0)
do $$
declare
  r record;
  v_grantees text;
begin
  for r in select oid, oid::regprocedure::text as sig
             from pg_proc
            where oid in ('public.current_user_role()'::regprocedure, 'public.user_has_role(user_role)'::regprocedure, 'public.rls_auto_enable()'::regprocedure)
  loop
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = r.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
      '8a PUBLIC no debe tener EXECUTE sobre ' || r.sig;
    select string_agg(coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC'), ',' order by a.grantee::regrole::text) into v_grantees
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = r.oid and a.privilege_type = 'EXECUTE';
    if r.sig = 'current_user_role()' then
      assert v_grantees = 'authenticated,postgres,service_role', '8b ACL final de current_user_role(): ' || v_grantees;
    else
      assert v_grantees = 'postgres,service_role', '8b ACL final de ' || r.sig || ': ' || v_grantees;
    end if;
  end loop;
end $$;

select 'TODOS LOS ASSERT DE 0063 PASARON' as resultado;
