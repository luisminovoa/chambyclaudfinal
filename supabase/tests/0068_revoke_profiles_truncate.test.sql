-- ============================================================
-- Pruebas de regresión — 0068_revoke_profiles_truncate.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero y un mensaje que
-- indica qué falló y si falta aplicar 0068). Consulta los catálogos reales
-- (relacl con aclexplode, has_table_privilege, pg_policies, pg_class) y
-- ejerce los roles reales con `set role`, igual que 0065. No simula nada.
--
-- Qué demuestra:
--   · anon y authenticated NO tienen TRUNCATE sobre public.profiles
--     (privilegio EFECTIVO y entradas de la ACL, incluida la de PUBLIC) y un
--     TRUNCATE real falla con 42501 "permission denied for table profiles".
--   · service_role CONSERVA TRUNCATE.
--   · Que SELECT/INSERT/UPDATE/DELETE (y REFERENCES/TRIGGER/MAINTAIN) NO
--     cambian solo se demuestra de forma EXACTA con la instantánea previa de
--     la ACL (3a/3b, ver abajo). Sin instantánea, el test verifica
--     únicamente lo que comprueban expresamente 2a-2c, 3c y 3d.
--   · RLS sigue habilitado y las policies de profiles quedan intactas
--     (identidad exacta de las policies solo con su instantánea, 4d).
--
-- Estado previo y control negativo:
--   · SIN 0068 aplicada esta prueba FALLA ya en el bloque 1 ("anon NO debe
--     tener TRUNCATE... ¿está aplicada la migración 0068?"). Ese es el
--     control negativo: una migración ausente o ineficaz no pasa.
--   · Con una instantánea tomada ANTES de 0068 (opcional, recomendado) la
--     prueba además (a) exige que el estado previo SÍ tuviera TRUNCATE para
--     anon y authenticated (el REVOKE tuvo algo que quitar) y (b) compara de
--     forma EXACTA que el único cambio de la ACL es la desaparición de esos
--     dos privilegios, y que las policies son idénticas a las previas:
--       create schema if not exists tap;
--       create table tap.profiles_acl_before as
--         select a.grantee::regrole::text as grantee, a.privilege_type
--         from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
--         where c.oid = 'public.profiles'::regclass;
--       create table tap.profiles_policies_before as
--         select policyname, cmd, permissive, roles::text as roles, qual, with_check
--         from pg_policies where schemaname = 'public' and tablename = 'profiles';
--     Sin instantánea esas comparaciones exactas se omiten con un AVISO (las
--     demás comprobaciones, por privilegio y por catálogo, siguen activas).
--     En ese modo NO se afirma que los demás privilegios de anon y
--     authenticated permanezcan idénticos: solo se comprueba lo que las
--     aserciones indican expresamente.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real — la prueba siembra usuarios): mismo harness que 0061-0067 —
-- roles anon/authenticated/service_role, esquema auth simulado, privilegios
-- por defecto de Supabase ANTES de las migraciones, migraciones 0001-0068
-- con 0056 y 0059 omitidas. service_role con BYPASSRLS, como en Supabase.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0068_revoke_profiles_truncate.test.sql
--
-- REQUISITOS DE EJECUCIÓN (base limpia, una sola vez): la prueba siembra
-- usuarios con identificadores FIJOS (fc000000-0000-4000-8000-00000000000N)
-- en auth.users y no puede ejecutarse dos veces seguidas sobre la misma
-- base sin reinicializarla (la segunda falla por claves duplicadas).
--
-- NOTA sobre el TRUNCATE funcional (bloque 5), observada en PostgreSQL 17.11
-- en el estado previo a 0068: el TRUNCATE simple de profiles falla con 0A000
-- (claves foráneas) aunque el rol tenga el privilegio; el TRUNCATE ...
-- CASCADE sí tiene éxito para authenticated. Para anon, el CASCADE falla con
-- 42501 pero sobre OTRA tabla (ratings, por 0065), no sobre profiles. Por eso
-- la prueba exige el mensaje exacto "permission denied for table profiles":
-- un rechazo por otra causa NO cuenta como protección de profiles.
--
-- LÍMITES: PostgREST no expone TRUNCATE, así que no se prueba por HTTP; el
-- TRUNCATE se ejerce por SQL con el rol real. Los intentos de TRUNCATE se
-- ejecutan en una subtransacción que SIEMPRE se revierte, de modo que ni
-- siquiera en un estado vulnerable (sin 0068) se pierden datos de la base.
-- ============================================================
\set ON_ERROR_STOP on

create schema if not exists tap;

-- Ejecuta p_sql como p_role en una subtransacción que se REVIERTE siempre.
-- p_deny = true : se espera 42501 "permission denied for table profiles".
-- p_deny = false: se espera que NO ocurra ese error (el privilegio existe;
--                 puede tener éxito o fallar por otra causa, p. ej. 0A000
--                 por claves foráneas que referencian profiles).
create or replace function tap.check_truncate(p_role text, p_sql text, p_deny boolean, p_label text)
returns void language plpgsql as $$
declare
  v_state text;
  v_msg text;
  v_res text := 'SIN ERROR (la sentencia tuvo exito y fue revertida)';
  v_denied boolean;
begin
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    raise exception 'tap-rollback' using errcode = 'P9999';
  exception
    when sqlstate 'P9999' then null;
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      v_res := '[' || v_state || '] ' || v_msg;
      v_denied := (v_state = '42501' and v_msg = 'permission denied for table profiles');
  end;
  execute 'reset role';
  v_denied := coalesce(v_denied, false);
  if p_deny and not v_denied then
    raise exception 'ASSERT FALLO [%]: % deberia recibir 42501 "permission denied for table profiles" y obtuvo: %. ¿Esta aplicada la migracion 0068?', p_label, p_role, v_res;
  end if;
  if (not p_deny) and v_denied then
    raise exception 'ASSERT FALLO [%]: % deberia CONSERVAR TRUNCATE sobre profiles y obtuvo: %', p_label, p_role, v_res;
  end if;
end $$;

-- ===== 0. Precondiciones del entorno =====
do $$ begin
  assert to_regclass('public.profiles') is not null, 'PRECONDICION: falta public.profiles';
  assert exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'service_role'),
    'PRECONDICION: faltan los roles anon/authenticated/service_role';
  assert (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'PRECONDICION: profiles debe tener RLS habilitado (el REVOKE debe ser efectivo CON RLS activo)';
end $$;

-- ===== 1. anon y authenticated: SIN TRUNCATE (privilegio efectivo y ACL) =====
do $$
declare v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(v_role, 'public.profiles', 'TRUNCATE'),
      '1a ' || v_role || ' NO debe tener TRUNCATE sobre profiles (privilegio efectivo). ¿Esta aplicada la migracion 0068?';
    assert not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                        where c.oid = 'public.profiles'::regclass and a.grantee = (select oid from pg_roles where rolname = v_role) and a.privilege_type = 'TRUNCATE'),
      '1b la ACL de profiles no debe contener TRUNCATE para ' || v_role || '. ¿Esta aplicada la migracion 0068?';
  end loop;
  -- un REVOKE a anon/authenticated no quitaria un TRUNCATE heredado de PUBLIC
  assert not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                      where c.oid = 'public.profiles'::regclass and a.grantee = 0 and a.privilege_type = 'TRUNCATE'),
    '1c la ACL de profiles no debe conceder TRUNCATE a PUBLIC (privilegio heredado)';
end $$;

-- ===== 2. service_role CONSERVA TRUNCATE (y el owner tambien) =====
do $$
begin
  assert has_table_privilege('service_role', 'public.profiles', 'TRUNCATE'), '2a service_role debe conservar TRUNCATE sobre profiles';
  assert exists (select 1 from pg_class c, aclexplode(c.relacl) a
                  where c.oid = 'public.profiles'::regclass and a.grantee = (select oid from pg_roles where rolname = 'service_role') and a.privilege_type = 'TRUNCATE'),
    '2b la ACL de profiles debe contener TRUNCATE para service_role';
  -- service_role conserva EXACTAMENTE el mismo conjunto de privilegios que el owner (nada menos)
  assert (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a
           where c.oid = 'public.profiles'::regclass and a.grantee = (select oid from pg_roles where rolname = 'service_role'))
       = (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a
           where c.oid = 'public.profiles'::regclass and a.grantee = c.relowner),
    '2c service_role debe conservar el conjunto completo de privilegios del owner';
end $$;

-- ===== 3. Privilegios que NO deben cambiar (comparacion EXACTA solo con instantanea) =====
-- 3a/3b. con instantanea previa: el UNICO cambio de la ACL es perder TRUNCATE en anon y authenticated
do $$
begin
  if to_regclass('tap.profiles_acl_before') is not null then
    assert exists (select 1 from tap.profiles_acl_before where grantee = 'anon' and privilege_type = 'TRUNCATE')
       and exists (select 1 from tap.profiles_acl_before where grantee = 'authenticated' and privilege_type = 'TRUNCATE'),
      '3a la instantanea previa a 0068 debia contener TRUNCATE para anon y authenticated (si no, el REVOKE no tenia nada que quitar)';
    assert not exists (
      (select grantee, privilege_type from tap.profiles_acl_before
        where not (grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE')
       except
       select a.grantee::regrole::text, a.privilege_type
         from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where c.oid = 'public.profiles'::regclass)
      union all
      (select a.grantee::regrole::text, a.privilege_type
         from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where c.oid = 'public.profiles'::regclass
       except
       select grantee, privilege_type from tap.profiles_acl_before
        where not (grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE'))),
      '3b la ACL de profiles solo debe diferir de la previa en TRUNCATE de anon y authenticated';
  else
    raise notice 'AVISO 3: no existe tap.profiles_acl_before; se omite la comparacion exacta de la ACL (ver la cabecera para crear la instantanea previa a 0068)';
  end if;
end $$;

-- 3c/3d. por privilegio efectivo, sin instantanea: SOLO se comprueba que service_role conserva los privilegios
-- listados y que authenticated conserva SELECT/INSERT/UPDATE. NO se demuestra que anon o authenticated no ganen
-- ni pierdan nada mas: esa garantia completa depende de la comparacion de ACL con la instantanea previa (3a/3b).
do $$
declare v_priv text;
begin
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER'] loop
    assert has_table_privilege('service_role', 'public.profiles', v_priv), '3c service_role debe conservar ' || v_priv || ' sobre profiles';
  end loop;
  assert has_table_privilege('authenticated', 'public.profiles', 'SELECT') and has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     and has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    '3d authenticated debe conservar SELECT/INSERT/UPDATE sobre profiles (los usa la aplicacion con RLS)';
end $$;

-- ===== 4. RLS y policies de profiles INTACTOS =====
do $$
declare v_names text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), '4a RLS sigue habilitado en profiles';
  assert not (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), '4b profiles sigue sin FORCE RLS';
  select string_agg(policyname || ':' || cmd || ':' || permissive, ', ' order by policyname) into v_names
    from pg_policies where schemaname = 'public' and tablename = 'profiles';
  assert v_names = 'profiles_delete_admin:DELETE:PERMISSIVE, profiles_insert_own:INSERT:PERMISSIVE, profiles_select_own_or_admin:SELECT:PERMISSIVE, profiles_update_own:UPDATE:PERMISSIVE',
    '4c profiles debe conservar exactamente sus 4 policies; reales: ' || coalesce(v_names, '<ninguna>');
  if to_regclass('tap.profiles_policies_before') is not null then
    assert not exists (
      (select policyname, cmd, permissive, roles, qual, with_check from tap.profiles_policies_before
       except
       select policyname, cmd, permissive, roles::text, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'profiles')
      union all
      (select policyname, cmd, permissive, roles::text, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'profiles'
       except
       select policyname, cmd, permissive, roles, qual, with_check from tap.profiles_policies_before)),
      '4d las policies de profiles deben ser IDENTICAS a las previas a 0068';
  else
    raise notice 'AVISO 4d: no existe tap.profiles_policies_before; se omite la comparacion exacta de policies (el nombre, comando y tipo de cada una ya se comprobo en 4c)';
  end if;
end $$;

-- ===== Semilla (como superusuario): perfiles reales para comprobar que nada se pierde =====
insert into auth.users (id, raw_user_meta_data) values
  ('fc000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"T Trabajador"}'::jsonb),
  ('fc000000-0000-4000-8000-000000000002', '{"role":"employer","full_name":"T Empleador"}'::jsonb);

-- ===== 5. TRUNCATE real: anon y authenticated reciben 42501; service_role conserva el privilegio =====
-- (siempre en una subtransaccion revertida: el estado vulnerable tampoco destruye datos)
select tap.check_truncate('anon', 'truncate table public.profiles', true, '5a anon TRUNCATE');
select tap.check_truncate('anon', 'truncate table public.profiles restart identity cascade', true, '5b anon TRUNCATE CASCADE');
select tap.check_truncate('authenticated', 'truncate table public.profiles', true, '5c authenticated TRUNCATE');
select tap.check_truncate('authenticated', 'truncate table public.profiles restart identity cascade', true, '5d authenticated TRUNCATE CASCADE');
-- service_role: el error NO debe ser de permisos (puede tener exito, o fallar por las FK que referencian profiles)
select tap.check_truncate('service_role', 'truncate table public.profiles', false, '5e service_role TRUNCATE');

do $$ begin
  assert (select count(*) from public.profiles where id in ('fc000000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002')) = 2,
    '5f ninguna fila de profiles desaparecio tras los intentos de TRUNCATE';
end $$;

-- ===== 6. Lo legitimo SIGUE funcionando con los roles reales (SELECT/UPDATE propios bajo RLS) =====
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', false);
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
set role authenticated;
do $$
declare n bigint;
begin
  assert (select count(*) from public.profiles) = 1, '6a authenticated sigue viendo SOLO su propio perfil (RLS de SELECT intacto)';
  update public.profiles set city = 'Lima' where id = auth.uid();
  get diagnostics n = row_count;
  assert n = 1, '6b authenticated sigue pudiendo actualizar su propio perfil';
  update public.profiles set city = 'Hackeo' where id = 'fc000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, '6c authenticated sigue sin poder tocar el perfil de otro (0 filas por RLS, no error de ACL)';
end $$;
reset role;

select 'TODOS LOS ASSERT DE 0068 PASARON' as resultado;
