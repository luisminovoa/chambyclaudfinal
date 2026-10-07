-- ============================================================
-- Pruebas de regresión — 0064_harden_ratings_select.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero). Consulta los
-- catálogos reales (pg_policies, privilegios, pg_class/pg_attribute) y
-- ejerce los roles reales con `set role` + `request.jwt.claim.sub`, igual
-- que 0008, 0048 y 0063. No simula ninguna autenticación propia: usa el
-- auth.uid() y el current_user_role() de las migraciones.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real): mismo harness que 0061/0062/0063 — roles anon/
-- authenticated/service_role, esquema auth simulado, privilegios por
-- defecto de Supabase ANTES de las migraciones, migraciones 0001-0064 con
-- 0056 y 0059 omitidas (pg_cron / pg_net no existen en Postgres genérico).
-- Para fidelidad con Supabase, service_role debe crearse con BYPASSRLS
-- (si no lo tiene, la prueba funcional 8b se limita a un aviso, no falla).
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0064_harden_ratings_select.test.sql
--
-- No requiere el stub de rls_auto_enable ni instantáneas previas.
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
  assert (select relrowsecurity from pg_class where oid = 'public.ratings'::regclass), 'PRECONDICION: ratings debe tener RLS habilitado';
  assert not (select relforcerowsecurity from pg_class where oid = 'public.ratings'::regclass), 'PRECONDICION: ratings NO debe tener FORCE RLS (la vista definer depende de ello)';
end $$;

-- ===== 1-5. Policies: ratings_select_all desaparece; ratings_select_own_or_admin la reemplaza =====
do $$
declare p record;
begin
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_select_all'),
    '1 ratings_select_all NO debe existir';

  select * into p from pg_policies
   where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_select_own_or_admin';
  assert p.policyname is not null, '2a ratings_select_own_or_admin debe existir';
  assert p.cmd = 'SELECT', '2b la policy es FOR SELECT: ' || p.cmd;
  assert p.roles = array['authenticated']::name[], '3 la policy es TO authenticated: ' || p.roles::text;
  assert not (p.roles @> array['public']::name[]), '4 la policy NO es TO public';
  assert p.qual is not null and p.qual <> 'true', '5a la policy NO es USING (true): ' || coalesce(p.qual, 'NULL');
  assert p.qual like '%rater_id%' and p.qual like '%rated_id%' and p.qual like '%current_user_role%',
    '5b USING cubre rater_id, rated_id y admin (current_user_role): ' || p.qual;

  -- ninguna policy SELECT abierta (USING true) sobre ratings, y nada de TO public en SELECT
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ratings'
                      and cmd in ('SELECT', 'ALL') and (qual = 'true' or roles @> array['public']::name[])),
    '5c no queda ninguna policy de lectura abierta sobre ratings';
end $$;

-- ===== 5d. ratings_insert_participant NO cambio (sigue siendo la unica otra policy) =====
do $$
declare p record;
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ratings') = 2,
    '5d ratings solo tiene 2 policies (select_own_or_admin e insert_participant)';
  select * into p from pg_policies
   where schemaname = 'public' and tablename = 'ratings' and policyname = 'ratings_insert_participant';
  assert p.policyname is not null and p.cmd = 'INSERT', '5e ratings_insert_participant sigue existiendo (INSERT)';
  assert p.roles = array['public']::name[], '5f ratings_insert_participant sigue TO public (sin cambios): ' || p.roles::text;
  assert p.with_check like '%completado%' and p.with_check like '%rater_id%' and p.with_check like '%assigned_worker_id%',
    '5g el WITH CHECK de ratings_insert_participant (0007) sigue intacto: ' || p.with_check;
end $$;

-- ===== 6-8. Privilegios sobre la tabla =====
do $$ begin
  assert not has_table_privilege('anon', 'public.ratings', 'SELECT'), '6a anon NO debe tener SELECT sobre ratings';
  assert not has_any_column_privilege('anon', 'public.ratings', 'SELECT'), '6b anon NO debe tener SELECT en ninguna columna de ratings';
  assert has_table_privilege('authenticated', 'public.ratings', 'SELECT'), '7 authenticated SI debe tener SELECT sobre ratings';
  assert has_table_privilege('service_role', 'public.ratings', 'SELECT'), '8a service_role SI debe tener SELECT sobre ratings';
  -- INSERT: 0064 no toca permisos de escritura
  assert has_table_privilege('authenticated', 'public.ratings', 'INSERT'), '8c authenticated conserva INSERT sobre ratings';
  assert has_table_privilege('service_role', 'public.ratings', 'INSERT'), '8d service_role conserva INSERT sobre ratings';
end $$;

-- ===== Semilla (como superusuario, mismo patron que 0048) =====
insert into auth.users (id, raw_user_meta_data) values
  ('f7000000-0000-4000-8000-000000000001', '{"role":"employer","full_name":"R Empleador E"}'::jsonb),
  ('f7000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"R Trabajador W"}'::jsonb),
  ('f7000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"R Trabajador S"}'::jsonb),
  ('f7000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"R Admin A"}'::jsonb),
  ('f7000000-0000-4000-8000-000000000005', '{"role":"employer","full_name":"R Empleador E2"}'::jsonb),
  ('f7000000-0000-4000-8000-000000000006', '{"role":"worker","full_name":"R Ajeno X"}'::jsonb);
update public.profiles set role = 'admin' where id = 'f7000000-0000-4000-8000-000000000004';

insert into public.jobs (id, employer_id, title, description, category, city, pay_type, status) values
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'R Job 1', 'Job completado E con W (ratings sembrados).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f7100000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000005', 'R Job 2', 'Job completado E2 con S (rating ajeno).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f7100000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000001', 'R Job 3', 'Job completado E con W (INSERT legitimo).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f7100000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-000000000001', 'R Job 4', 'Job completado E con W (INSERT con RETURNING).', 'Otro', 'Lima', 'fijo', 'abierto'),
  ('f7100000-0000-4000-8000-000000000005', 'f7000000-0000-4000-8000-000000000001', 'R Job 5', 'Job en progreso E con W (no calificable aun).', 'Otro', 'Lima', 'fijo', 'abierto');
update public.jobs set status = 'completado', assigned_worker_id = 'f7000000-0000-4000-8000-000000000002'
  where id in ('f7100000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000003', 'f7100000-0000-4000-8000-000000000004');
update public.jobs set status = 'completado', assigned_worker_id = 'f7000000-0000-4000-8000-000000000003'
  where id = 'f7100000-0000-4000-8000-000000000002';
update public.jobs set status = 'en_progreso', assigned_worker_id = 'f7000000-0000-4000-8000-000000000002'
  where id = 'f7100000-0000-4000-8000-000000000005';

insert into public.ratings (job_id, rater_id, rated_id, score, comment) values
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 4, 'COMENTARIO-E-A-W'),
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 5, 'COMENTARIO-W-A-E'),
  ('f7100000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000005', 'f7000000-0000-4000-8000-000000000003', 3, 'COMENTARIO-E2-A-S');

-- ===== 15-16. rating_summary: columnas y definicion intactas, y mismos agregados para anon/authenticated =====
do $$
declare v_cols text; v_opts text[];
begin
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.rating_summary'::regclass and a.attnum > 0 and not a.attisdropped;
  assert v_cols = 'profile_id:uuid, average_score:numeric, total_ratings:bigint', '16a columnas de rating_summary: ' || v_cols;
  select reloptions into v_opts from pg_class where oid = 'public.rating_summary'::regclass;
  assert v_opts is null or not (v_opts::text like '%security_invoker%'), '16b rating_summary sigue siendo vista definer (sin security_invoker)';
  assert pg_get_viewdef('public.rating_summary'::regclass) like '%GROUP BY%', '16c rating_summary sigue agregando por rated_id';
  assert (select relowner from pg_class where oid = 'public.rating_summary'::regclass) = (select relowner from pg_class where oid = 'public.ratings'::regclass),
    '16d rating_summary conserva el mismo owner que ratings';
end $$;

-- como anon: la vista definer SIGUE respondiendo con TODOS los agregados (3 perfiles calificados)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  assert (select count(*) from public.rating_summary) = 3, '15a anon ve los 3 agregados de rating_summary';
  assert (select average_score from public.rating_summary where profile_id = 'f7000000-0000-4000-8000-000000000002') = 4.00
     and (select total_ratings from public.rating_summary where profile_id = 'f7000000-0000-4000-8000-000000000002') = 1,
    '15b anon ve el agregado correcto de W (4.00 / 1)';
  assert (select average_score from public.rating_summary where profile_id = 'f7000000-0000-4000-8000-000000000001') = 5.00,
    '15c anon ve el agregado correcto de E (5.00)';
end $$;
reset role;

-- como authenticated ajeno: mismos agregados (la vista no depende de las policies de ratings)
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000006', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.rating_summary) = 3, '15d un authenticated ajeno ve los 3 agregados de rating_summary';
  assert (select average_score from public.rating_summary where profile_id = 'f7000000-0000-4000-8000-000000000003') = 3.00,
    '15e un authenticated ajeno ve el agregado de S (3.00)';
end $$;
reset role;

-- ===== 6 (funcional). anon: error 42501 al leer ratings, aunque pida solo comment/score =====
select tap.expect_error('anon', null, 'select count(*) from public.ratings', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, 'select comment from public.ratings', '42501', 'permission denied for table ratings');
select tap.expect_error('anon', null, 'select rater_id, rated_id, job_id, score from public.ratings', '42501', 'permission denied for table ratings');

-- ===== 9. RATER (E): ve las que emitio; consulta exacta de dashboard/employer (R3) =====
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ratings where rater_id = 'f7000000-0000-4000-8000-000000000001') = 1, '9a E ve la calificacion que emitio';
  assert (select count(*) from public.ratings where job_id in ('f7100000-0000-4000-8000-000000000001')
            and rater_id = 'f7000000-0000-4000-8000-000000000001') = 1, '9b consulta R3 (job_id por rater_id): devuelve el job ya calificado';
  assert (select count(*) from public.ratings) = 2, '9c E ve exactamente 2 (la que emitio y la que recibio), no la de E2->S';
  assert (select count(*) from public.ratings where job_id = 'f7100000-0000-4000-8000-000000000002') = 0, '9d E NO ve la calificacion del job 2 (ajena)';
end $$;
reset role;

-- ===== 10. RATED (W): consulta exacta de dashboard/worker (R1) y (R2) =====
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$
declare r record;
begin
  select * into r from public.ratings
   where rated_id = 'f7000000-0000-4000-8000-000000000002'
   order by created_at desc limit 5;
  assert r.id is not null and r.score = 4 and r.comment = 'COMENTARIO-E-A-W', '10a consulta R1: W ve la resena recibida con su comentario';
  assert (select count(*) from public.ratings where rated_id = 'f7000000-0000-4000-8000-000000000002') = 1, '10b W ve 1 resena recibida';
  assert (select count(*) from public.ratings where job_id in ('f7100000-0000-4000-8000-000000000001')
            and rater_id = 'f7000000-0000-4000-8000-000000000002') = 1, '10c consulta R2 (job_id por rater_id) para W';
  assert (select count(*) from public.ratings) = 2, '10d W ve exactamente 2 (recibida y emitida)';
end $$;
reset role;

-- ===== 11. AJENO (X): ni rater ni rated -> 0 filas, con y sin filtros; y S no ve el job de E/W =====
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000006', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ratings) = 0, '11a un authenticated ajeno NO ve ninguna calificacion';
  assert (select count(*) from public.ratings where rated_id = 'f7000000-0000-4000-8000-000000000002') = 0, '11b ajeno consultando por rated_id de W: 0 filas';
  assert (select count(*) from public.ratings where comment like 'COMENTARIO-%') = 0, '11c ajeno NO puede leer comentarios';
  assert (select count(*) from public.ratings where job_id = 'f7100000-0000-4000-8000-000000000001') = 0, '11d ajeno NO ve las calificaciones de un job ajeno';
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000003', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ratings) = 1, '11e S solo ve la suya (la recibida de E2)';
  assert (select count(*) from public.ratings where job_id = 'f7100000-0000-4000-8000-000000000001') = 0, '11f S NO ve las calificaciones de E y W';
end $$;
reset role;

-- ===== 12. ADMIN: ve todas (y el count(*) de admin/page, R4) =====
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000004', false);
set role authenticated;
do $$ begin
  assert public.current_user_role() = 'admin', '12a current_user_role() devuelve admin';
  assert (select count(*) from public.ratings) = 3, '12b admin ve las 3 calificaciones (consulta count de admin/page)';
  assert (select count(*) from public.ratings where comment like 'COMENTARIO-%') = 3, '12c admin lee todos los comentarios';
end $$;
reset role;

-- ===== 8b. service_role: mismo acceso total que el admin client (beta.ts, R5), si tiene BYPASSRLS como en Supabase =====
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
do $$ begin
  if (select rolbypassrls from pg_roles where rolname = 'service_role') then
    assert (select count(*) from public.ratings) = 3, '8b service_role (BYPASSRLS) lee todos los score';
  else
    raise notice 'AVISO 8b: service_role sin BYPASSRLS en este harness; la prueba funcional se omite (el privilegio SELECT ya se comprobo en 8a)';
  end if;
end $$;
reset role;

-- ===== 13. INSERT legitimo SIGUE funcionando (sin RETURNING, como submitRating) =====
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000001', false);
set role authenticated;
insert into public.ratings (job_id, rater_id, rated_id, score, comment)
values ('f7100000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 5, 'INSERT-LEGITIMO');
do $$ begin
  assert (select count(*) from public.ratings where rater_id = 'f7000000-0000-4000-8000-000000000001'
            and job_id = 'f7100000-0000-4000-8000-000000000003') = 1, '13a el INSERT legitimo (sin RETURNING) funciono y el rater lo ve despues';
end $$;
-- 13b. con RETURNING (necesita que el rater pueda leer su propia fila: lo permite la policy nueva)
do $$ declare v uuid; begin
  insert into public.ratings (job_id, rater_id, rated_id, score)
  values ('f7100000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 4)
  returning id into v;
  assert v is not null, '13b INSERT ... RETURNING del rater funciona con la policy nueva';
end $$;
reset role;

-- el trabajador W tambien puede calificar a E (la otra direccion legitima) en el job 3
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000002', false);
set role authenticated;
insert into public.ratings (job_id, rater_id, rated_id, score)
values ('f7100000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 5);
do $$ begin
  assert (select count(*) from public.ratings where rater_id = 'f7000000-0000-4000-8000-000000000002'
            and job_id = 'f7100000-0000-4000-8000-000000000003') = 1, '13c el worker califica al empleador (INSERT legitimo)';
end $$;
reset role;

-- ===== 14. INSERT ilegitimo SIGUE fallando (RLS: 42501 "new row violates row-level security policy") =====
-- 14a. un ajeno (X) intenta calificar en un job que no es suyo
select tap.expect_error('authenticated', 'f7000000-0000-4000-8000-000000000006',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000006','f7000000-0000-4000-8000-000000000002',1)$q$,
  '42501', 'new row violates row-level security policy%');
-- 14b. suplantar a otro rater (E inserta como si fuera W)
select tap.expect_error('authenticated', 'f7000000-0000-4000-8000-000000000001',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001',1)$q$,
  '42501', 'new row violates row-level security policy%');
-- 14c. rated_id que no es la contraparte (E califica a S en el job 1)
select tap.expect_error('authenticated', 'f7000000-0000-4000-8000-000000000001',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000003',1)$q$,
  '42501', 'new row violates row-level security policy%');
-- 14d. job que no esta completado (job 5 en_progreso)
select tap.expect_error('authenticated', 'f7000000-0000-4000-8000-000000000001',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000005','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002',5)$q$,
  '42501', 'new row violates row-level security policy%');
-- 14e. anon no puede insertar (conserva el privilegio INSERT, pero la policy exige auth.uid() = rater_id)
select tap.expect_error('anon', null,
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002',1)$q$,
  '42501', '%ratings%');
-- 14f. duplicado legitimo: la unicidad (job, rater, rated) sigue vigente -> 23505 (sin filtrar por SELECT)
select tap.expect_error('authenticated', 'f7000000-0000-4000-8000-000000000001',
  $q$insert into public.ratings (job_id, rater_id, rated_id, score) values ('f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002',2)$q$,
  '23505', '%duplicate key%');

-- Nada de lo anterior debio colarse: el conteo total (como superusuario) son las 3 semillas + 3 inserciones legitimas
do $$ begin
  assert (select count(*) from public.ratings) = 6, '14g no se colo ninguna calificacion ilegitima (esperadas 6)';
end $$;

select 'TODOS LOS ASSERT DE 0064 PASARON' as resultado;
