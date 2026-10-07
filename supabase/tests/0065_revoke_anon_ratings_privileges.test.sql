-- ============================================================
-- Pruebas de regresión — 0065_revoke_anon_ratings_privileges.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero). Consulta los
-- catálogos reales (relacl con aclexplode, has_table_privilege,
-- pg_policies, pg_attribute) y ejerce los roles reales con `set role` +
-- `request.jwt.claim.sub`, igual que 0008, 0048, 0063 y 0064. No simula
-- ninguna autenticación propia.
--
-- Distingue dos cosas que no son lo mismo:
--   · ACL (privilegio): el rol NO puede ni intentar la operación
--     -> 42501 "permission denied for table ratings".
--   · RLS (policy): el rol tiene el privilegio pero la fila se rechaza
--     -> 42501 "new row violates row-level security policy" o "0 filas".
-- Tras 0065 `anon` debe fallar SIEMPRE por ACL, nunca por RLS.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real — la prueba siembra usuarios y datos): mismo harness que
-- 0061-0064 — roles anon/authenticated/service_role, esquema auth simulado,
-- privilegios por defecto de Supabase ANTES de las migraciones, migraciones
-- 0001-0065 con 0056 y 0059 omitidas. service_role con BYPASSRLS, como en
-- Supabase.
--
-- Opcional (recomendado): antes de aplicar 0065, tomar una instantánea para
-- que la prueba compare EXACTAMENTE las entradas de ACL de authenticated y
-- service_role (si no existe, se usa la comprobación por privilegio):
--   create schema if not exists tap;
--   create table tap.ratings_acl_before as
--     select a.grantee::regrole::text as grantee, a.privilege_type
--     from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass;
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0065_revoke_anon_ratings_privileges.test.sql
--
-- No requiere el stub de rls_auto_enable.
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

-- ===== 0. Precondiciones del entorno =====
do $$ begin
  assert to_regclass('public.ratings') is not null, 'PRECONDICION: falta public.ratings';
  assert to_regclass('public.rating_summary') is not null, 'PRECONDICION: falta public.rating_summary';
  assert (select relrowsecurity from pg_class where oid = 'public.ratings'::regclass), 'PRECONDICION: ratings debe tener RLS habilitado (el REVOKE debe ser efectivo CON RLS activo)';
  assert not (select relforcerowsecurity from pg_class where oid = 'public.ratings'::regclass), 'PRECONDICION: ratings NO debe tener FORCE RLS';
  assert exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'service_role'),
    'PRECONDICION: faltan los roles anon/authenticated/service_role';
end $$;

-- ===== 1. anon: SIN ningun privilegio sobre ratings (ACL, independiente de RLS) =====
do $$
declare
  v_priv text;
  v_anon oid := (select oid from pg_roles where rolname = 'anon');
begin
  foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    assert not has_table_privilege('anon', 'public.ratings', v_priv), '1a anon NO debe tener ' || v_priv || ' sobre ratings';
  end loop;
  -- MAINTAIN existe desde PostgreSQL 17: se comprueba solo si el servidor lo expone
  if current_setting('server_version_num')::int >= 170000 then
    assert not has_table_privilege('anon', 'public.ratings', 'MAINTAIN'), '1b anon NO debe tener MAINTAIN sobre ratings (PG17+)';
  end if;
  -- sin privilegios por columna (los hay para SELECT/INSERT/UPDATE/REFERENCES)
  foreach v_priv in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
    assert not has_any_column_privilege('anon', 'public.ratings', v_priv), '1c anon NO debe tener ' || v_priv || ' en ninguna columna de ratings';
  end loop;
  -- a nivel ACL: ninguna entrada de anon ni de PUBLIC en relacl (un REVOKE a anon no quitaria lo heredado de PUBLIC)
  assert not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                      where c.oid = 'public.ratings'::regclass and a.grantee = v_anon),
    '1d relacl no debe contener ninguna entrada para anon';
  assert not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                      where c.oid = 'public.ratings'::regclass and a.grantee = 0),
    '1e relacl no debe contener ninguna entrada para PUBLIC (privilegio heredado)';
  assert not exists (select 1 from pg_attribute where attrelid = 'public.ratings'::regclass and attnum > 0 and not attisdropped and attacl is not null
                      and attacl::text like '%anon=%'),
    '1f ninguna columna de ratings tiene grants para anon';
end $$;

-- ===== 2-3. authenticated y service_role CONSERVAN sus privilegios =====
do $$
declare v_priv text; v_role text;
begin
  foreach v_role in array array['authenticated','service_role'] loop
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      assert has_table_privilege(v_role, 'public.ratings', v_priv), '2/3 ' || v_role || ' debe conservar ' || v_priv || ' sobre ratings';
    end loop;
  end loop;
  -- los grantees de la ACL son exactamente el owner, authenticated y service_role
  assert (select string_agg(distinct a.grantee::regrole::text, ',' order by a.grantee::regrole::text)
            from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           where c.oid = 'public.ratings'::regclass) = 'authenticated,postgres,service_role',
    '2/3 grantees de ratings: ' || (select string_agg(distinct a.grantee::regrole::text, ',' order by a.grantee::regrole::text) from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass);
  -- authenticated y service_role tienen EXACTAMENTE los mismos privilegios que el owner (nada menos, nada mas)
  assert (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee = (select oid from pg_roles where rolname = 'authenticated'))
       = (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee = (select oid from pg_roles where rolname = 'postgres')),
    '2 authenticated conserva exactamente el conjunto completo de privilegios';
  assert (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee = (select oid from pg_roles where rolname = 'service_role'))
       = (select string_agg(a.privilege_type, ',' order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee = (select oid from pg_roles where rolname = 'postgres')),
    '3 service_role conserva exactamente el conjunto completo de privilegios';
end $$;

-- 2b/3b. si hay instantanea previa a 0065, las entradas de authenticated y service_role son IDENTICAS
do $$
begin
  if to_regclass('tap.ratings_acl_before') is not null then
    assert not exists (
      (select grantee, privilege_type from tap.ratings_acl_before where grantee in ('authenticated','service_role')
       except
       select a.grantee::regrole::text, a.privilege_type from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee::regrole::text in ('authenticated','service_role'))
      union all
      (select a.grantee::regrole::text, a.privilege_type from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.ratings'::regclass and a.grantee::regrole::text in ('authenticated','service_role')
       except
       select grantee, privilege_type from tap.ratings_acl_before where grantee in ('authenticated','service_role'))),
      '2b/3b las ACL de authenticated y service_role son identicas a las previas a 0065';
    assert (select count(*) from tap.ratings_acl_before where grantee = 'anon') > 0,
      '2c la instantanea previa SI contenia privilegios de anon (el REVOKE tuvo algo que quitar)';
  else
    raise notice 'AVISO 2b/3b: no existe tap.ratings_acl_before; se omite la comparacion exacta con la ACL previa (la comprobacion por privilegio ya paso)';
  end if;
end $$;

-- ===== 4. Policies de ratings SIN cambios =====
do $$
declare p record;
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ratings') = 2, '4a ratings tiene exactamente 2 policies';
  select * into p from pg_policies where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_insert_participant';
  assert p.policyname is not null and p.cmd = 'INSERT' and p.permissive = 'PERMISSIVE', '4b ratings_insert_participant existe (INSERT, PERMISSIVE)';
  assert p.roles = array['public']::name[], '4c ratings_insert_participant sigue TO public: ' || p.roles::text;
  assert p.with_check like '%completado%' and p.with_check like '%rater_id%' and p.with_check like '%assigned_worker_id%' and p.with_check like '%employer_id%',
    '4d WITH CHECK de ratings_insert_participant intacto: ' || p.with_check;
  select * into p from pg_policies where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_select_own_or_admin';
  assert p.policyname is not null and p.cmd = 'SELECT' and p.permissive = 'PERMISSIVE', '4e ratings_select_own_or_admin existe (SELECT, PERMISSIVE)';
  assert p.roles = array['authenticated']::name[], '4f ratings_select_own_or_admin sigue TO authenticated: ' || p.roles::text;
  assert p.qual like '%rater_id%' and p.qual like '%rated_id%' and p.qual like '%current_user_role%' and p.qual <> 'true', '4g USING de ratings_select_own_or_admin intacto: ' || p.qual;
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ratings' and cmd in ('UPDATE', 'DELETE', 'ALL')),
    '4h sigue sin existir ninguna policy UPDATE/DELETE/ALL sobre ratings';
  assert (select relrowsecurity from pg_class where oid = 'public.ratings'::regclass) and not (select relforcerowsecurity from pg_class where oid = 'public.ratings'::regclass),
    '4i RLS sigue habilitado y sin FORCE';
end $$;

-- ===== 5. rating_summary SIN cambios (definicion, owner, columnas y acceso de anon) =====
do $$
declare v_cols text; v_opts text[];
begin
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.rating_summary'::regclass and a.attnum > 0 and not a.attisdropped;
  assert v_cols = 'profile_id:uuid, average_score:numeric, total_ratings:bigint', '5a columnas de rating_summary: ' || v_cols;
  select reloptions into v_opts from pg_class where oid = 'public.rating_summary'::regclass;
  assert v_opts is null or not (v_opts::text like '%security_invoker%'), '5b rating_summary sigue siendo vista definer (sin security_invoker)';
  assert pg_get_viewdef('public.rating_summary'::regclass) like '%GROUP BY%', '5c rating_summary sigue agregando por rated_id';
  assert (select relowner from pg_class where oid = 'public.rating_summary'::regclass) = (select relowner from pg_class where oid = 'public.ratings'::regclass),
    '5d rating_summary conserva el owner de ratings';
  -- el REVOKE sobre la TABLA no toca los permisos de la VISTA: anon sigue leyendola
  assert has_table_privilege('anon', 'public.rating_summary', 'SELECT'), '5e anon conserva SELECT sobre la vista rating_summary';
  assert has_table_privilege('authenticated', 'public.rating_summary', 'SELECT'), '5f authenticated conserva SELECT sobre la vista rating_summary';
end $$;

-- ===== Semilla (como superusuario, mismo patron que 0048/0064) =====
insert into auth.users (id, raw_user_meta_data) values
  ('f9000000-0000-4000-8000-000000000001', '{"role":"employer","full_name":"Q Empleador E"}'::jsonb),
  ('f9000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Q Trabajador W"}'::jsonb),
  ('f9000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"Q Ajeno X"}'::jsonb),
  ('f9000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"Q Admin A"}'::jsonb);
update public.profiles set role = 'admin' where id = 'f9000000-0000-4000-8000-000000000004';

insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status) values
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'Q Job 1', 'Job completado E con W (ratings sembrados).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f9100000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001', 'Q Job 3', 'Job completado E con W (INSERT legitimo).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001', 'Q Job 4', 'Job completado E con W (INSERT con RETURNING).', 'Otro', 'Lima', 'fijo', 'abierto');
update public.jobs set status = 'completado', assigned_worker_id = 'f9000000-0000-4000-8000-000000000002'
  where id in ('f9100000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000003', 'f9100000-0000-4000-8000-000000000004');

insert into public.ratings (id, job_id, rater_id, rated_id, score, comment) values
  ('f9200000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 4, 'COMENTARIO-E-A-W'),
  ('f9200000-0000-4000-8000-000000000002', 'f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', 5, 'COMENTARIO-W-A-E');

-- ===== 8. El REVOKE es efectivo CON RLS activo: anon falla por ACL (no por RLS) en CADA operacion =====
-- (el mensaje exacto distingue ACL "permission denied for table ratings" de RLS "new row violates row-level security")
select tap.expect_error('anon', null, 'select count(*) from public.ratings', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, 'select comment from public.ratings', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null,
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f9100000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002',5)$q$,
  '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null,
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f9100000-0000-4000-8000-000000000003',null,'f9000000-0000-4000-8000-000000000002',1)$q$,
  '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null,
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f9100000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002',1) on conflict (job_id, rater_id, rated_id) do update set score = 1$q$,
  '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, $q$update public.ratings set score = 1 where id = 'f9200000-0000-4000-8000-000000000001'$q$, '42501', 'permission denied for table ratings');
-- UPDATE/DELETE SIN where: antes del 0065 eran "0 filas" silenciosas (RLS); ahora son error de ACL
select tap.expect_error('anon', null, 'update public.ratings set score = 1', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, $q$delete from public.ratings where id = 'f9200000-0000-4000-8000-000000000001'$q$, '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, 'delete from public.ratings', '42501', 'permission denied for table ratings');

-- ===== 9. anon NO puede ejecutar TRUNCATE (TRUNCATE no esta protegido por RLS) =====
select tap.expect_error('anon', null, 'truncate table public.ratings', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, 'truncate table public.ratings restart identity cascade', '42501', 'permission denied for table ratings');
do $$ begin
  assert (select count(*) from public.ratings) = 2, '9c ninguna fila desaparecio tras los intentos de TRUNCATE/DELETE de anon (esperadas 2)';
  assert (select score from public.ratings where id = 'f9200000-0000-4000-8000-000000000001') = 4, '9d ninguna fila fue modificada por los intentos de UPDATE de anon';
end $$;

-- ===== comportamiento de RLS de authenticated SIN cambios: UPDATE/DELETE siguen siendo "0 filas" (sin policy), no error de ACL =====
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare n bigint;
begin
  update public.ratings set score = 1 where id = 'f9200000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, '8b authenticated: UPDATE sobre su propia calificacion sigue siendo 0 filas por RLS (sin policy), no error de ACL';
  delete from public.ratings where id = 'f9200000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, '8c authenticated: DELETE sobre su propia calificacion sigue siendo 0 filas por RLS (sin policy), no error de ACL';
  assert (select count(*) from public.ratings) = 2, '8d authenticated (E) sigue viendo sus 2 calificaciones (emitida y recibida) via ratings_select_own_or_admin';
end $$;
reset role;

-- ===== 6. INSERT legitimo como authenticated SIGUE funcionando (con y sin RETURNING) =====
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', false);
set role authenticated;
insert into public.ratings (job_id, rater_id, rated_id, score, comment)
values ('f9100000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 5, 'INSERT-LEGITIMO');
do $$ declare v uuid; begin
  assert (select count(*) from public.ratings where job_id = 'f9100000-0000-4000-8000-000000000003' and rater_id = 'f9000000-0000-4000-8000-000000000001') = 1,
    '6a el INSERT legitimo (sin RETURNING, como submitRating) funciono y el rater lo ve';
  insert into public.ratings (job_id, rater_id, rated_id, score)
  values ('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 4)
  returning id into v;
  assert v is not null, '6b INSERT ... RETURNING del rater funciona';
end $$;
reset role;

-- el inserto ilegitimo de authenticated SIGUE rechazado por RLS (no por ACL: authenticated conserva el privilegio)
select tap.expect_error('authenticated', 'f9000000-0000-4000-8000-000000000003',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f9100000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-000000000002',1)$q$,
  '42501', 'new row violates row-level security policy%');

-- ===== service_role conserva acceso total (BYPASSRLS como en Supabase) =====
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
do $$
declare n bigint;
begin
  assert (select count(*) from public.ratings) = 4, '3c service_role lee las 4 filas';
  if (select rolbypassrls from pg_roles where rolname = 'service_role') then
    update public.ratings set score = score where id = 'f9200000-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
    assert n = 1, '3d service_role (BYPASSRLS) puede UPDATE';
  else
    raise notice 'AVISO 3d: service_role sin BYPASSRLS en este harness; se omite la prueba funcional de UPDATE (el privilegio ya se comprobo)';
  end if;
end $$;
reset role;

-- ===== Como admin: lectura total sin cambios =====
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000004', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ratings) = 4, '8e admin sigue viendo todas las calificaciones (4)';
end $$;
reset role;

-- ===== 5 (funcional). rating_summary sigue respondiendo a anon con los agregados =====
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  assert (select count(*) from public.rating_summary) = 2, '5g anon ve los 2 agregados de rating_summary (E y W)';
  assert (select total_ratings from public.rating_summary where profile_id = 'f9000000-0000-4000-8000-000000000002') = 3, '5h agregado de W: 3 calificaciones (1 sembrada + 2 insertadas)';
end $$;
reset role;

select 'TODOS LOS ASSERT DE 0065 PASARON' as resultado;
