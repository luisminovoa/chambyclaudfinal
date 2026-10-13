-- ============================================================
-- Pruebas de regresión — 0067_harden_profiles_role_switch.sql
-- ============================================================
-- Auto-verificable: usa ASSERT y se ejecuta con ON_ERROR_STOP (un fallo
-- termina el script con código de salida distinto de cero). Consulta los
-- catálogos reales (pg_policies, privilegios efectivos) y ejerce los roles
-- reales con `set role` + los claims JWT que fija PostgREST/Supabase
-- (request.jwt.claims JSON y los claims individuales request.jwt.claim.*),
-- de modo que auth.uid() resuelve como en producción. Cada caso corre en
-- una subtransacción que se REVIERTE: los casos no se contaminan entre sí.
--
-- Qué demuestra: un usuario que llama DIRECTAMENTE a la API (sin pasar por
-- switchRoleAction()) solo puede poner profiles.role = 'worker'/'employer'
-- si posee ese rol ACTIVO en user_roles (o si el rol no cambia), nadie
-- puede insertarse un perfil con role = 'admin', y siguen funcionando el
-- onboarding, el cambio legítimo entre roles, la rama de administrador
-- (changeUserRole() escribe profiles.role ANTES de crear la fila de
-- user_roles) y la protección de is_active (0047).
--
-- CLASIFICACIÓN de cada operación (cada categoría se verificó contra el
-- comportamiento real de PostgreSQL antes de usarla como expectativa):
--   PERMITIDA : la sentencia afectó >= 1 fila.
--   RLS       : 42501 "new row violates row-level security policy ..."
--               (el WITH CHECK rechazó la fila nueva; el rol SÍ tenía el
--               privilegio sobre la tabla — se comprueba abajo).
--   0FILAS    : sin error, pero el USING dejó 0 filas (denegación silenciosa:
--               la fila ajena nunca es visible para el UPDATE).
--   ACL       : 42501 "permission denied ..." (falta privilegio, p. ej.
--               EXECUTE de current_user_role() para anon desde 0063).
--   ERROR     : cualquier otro error (nunca es un resultado esperado aquí).
-- Esperado: una de las categorías anteriores, que debe COINCIDIR EXACTAMENTE
-- con lo obtenido; un rechazo por otro motivo (p. ej. ACL en vez de RLS, o
-- un error inesperado) hace fallar el caso aunque "también sea un rechazo".
--   INFO      : decisión de diseño abierta; solo se REGISTRA el resultado
--               actual (no falla en ningún sentido).
--   OMITIDO   : el caso depende de una propiedad del harness que no se
--               cumple (p. ej. service_role sin BYPASSRLS); no se ejecuta ni
--               se inventa una expectativa.
--
-- Cómo ejecutar (contra un Postgres 17 desechable, NUNCA contra el proyecto
-- Supabase real — la prueba siembra usuarios): mismo harness que 0061-0066,
-- con auth.uid() definido como en Supabase
--   coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
--            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
-- y migraciones 0001-0067 (0056 y 0059 omitidas). service_role con
-- BYPASSRLS y los privilegios por defecto de Supabase sobre las tablas de
-- public (anon/authenticated/service_role).
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0067_harden_profiles_role_switch.test.sql
--
-- REQUISITOS DE EJECUCIÓN (base limpia, una sola vez):
--   · La prueba SIEMBRA usuarios con identificadores FIJOS en auth.users
--     (fe000000-0000-4000-8000-0000000000NN, más ...e4 y ...e5 en el grupo E)
--     y deja esas filas (y sus perfiles/roles) en la base: solo los casos
--     individuales se revierten, la semilla no.
--   · Cada ejecución debe hacerse en una base PostgreSQL desechable y LIMPIA
--     (p. ej. una copia nueva de la base con las migraciones 0001-0067).
--   · NO puede ejecutarse dos veces seguidas sobre la misma base sin
--     reinicializarla: la segunda ejecución falla por claves duplicadas
--     (duplicate key value violates unique constraint "users_pkey" en
--     auth.users, error 23505). No es un defecto de la migración 0067.
--
-- LÍMITES de esta prueba (documentados, no cubiertos aquí):
--   · Concurrencia: cada caso corre en una sola sesión; la carrera "cambiar
--     de modo mientras otra transacción desactiva el rol" no es reproducible
--     en este harness (ver LIMITACIÓN DE DISEÑO en la migración y los casos L1/L2).
--   · Los casos con 0FILAS sobre perfiles AJENOS (A13, B5) no prueban el
--     USING de profiles_update_own por sí solos: un UPDATE solo ve las filas
--     que también permite profiles_select_own_or_admin, así que la
--     denegación silenciosa sería la misma con un USING abierto (se
--     comprobó con una mutación). Verifican el comportamiento efectivo del
--     CONJUNTO de policies (SELECT + UPDATE), no el USING aislado.
--     Las comprobaciones de catálogo 1b/1b2/1b3 garantizan que el TEXTO del
--     USING instalado es el esperado, que la policy es PERMISSIVE y que no
--     hay otra policy de UPDATE/ALL que se sume con OR. NO demuestran el
--     comportamiento funcional del USING ni la semántica de
--     current_user_role(); y la igualdad de texto depende del formato de
--     pg_get_expr de PostgreSQL 17 (con `user_role` visible en el search_path).
--     Esas comprobaciones de catálogo detectan determinadas mutaciones
--     ESTRUCTURALES (p. ej. USING (true), "... OR true", un USING sin la
--     rama de administrador, una segunda policy permisiva de UPDATE o una
--     policy RESTRICTIVE), pero A13 y B5 no aíslan funcionalmente
--     profiles_update_own.USING: con el catálogo omitido y USING (true),
--     ambos casos siguen dando 0FILAS.
--   · Capa PostgREST/HTTP: se ejercen las policies con role + claims, no el
--     servidor PostgREST; sus códigos HTTP no se verifican.
--   · Privilegios reales de producción: el modelo supone los default
--     privileges de Supabase. Los casos de anon que dependen de ellos
--     calculan la expectativa a partir de los privilegios EFECTIVOS
--     (has_table_privilege) en lugar de suponerla.
--   · Las "mutaciones" (versiones rotas de la policy que esta prueba debe
--     rechazar) se ejecutan desde el harness, no desde este archivo.
-- ============================================================
\set ON_ERROR_STOP on

create schema if not exists tap;
drop table if exists tap.rs_results;
create table tap.rs_results (
  n serial primary key, grupo text, caso text, esperado text, obtenido text, detalle text, ok boolean
);

create or replace function tap.rs_case(
  p_grupo text, p_caso text, p_esperado text, p_role text, p_sub text, p_sql text
) returns void language plpgsql as $$
declare
  n bigint; v_obt text; v_det text; st text; msg text; v_ok boolean;
begin
  if p_esperado = 'OMITIDO' then
    insert into tap.rs_results (grupo, caso, esperado, obtenido, detalle, ok)
    values (p_grupo, p_caso, 'OMITIDO', 'OMITIDO', 'se omite: no se cumple una propiedad del harness de la que depende este caso', true);
    return;
  end if;
  begin
    perform set_config('request.jwt.claims',
      case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_role, 'aud', p_role)::text end, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
    perform set_config('request.jwt.claim.role', p_role, true);
    execute format('set local role %I', p_role);
    execute p_sql;
    get diagnostics n = row_count;
    execute 'set constraints all immediate';   -- fuerza prevent_zero_active_roles (diferido) dentro del caso
    v_obt := case when n = 0 then '0FILAS' else 'PERMITIDA' end;
    v_det := 'filas=' || n;
    raise exception 'tap-rollback' using errcode = 'P9999';   -- revierte la subtransaccion del caso
  exception
    when sqlstate 'P9999' then null;
    when others then
      get stacked diagnostics st = returned_sqlstate, msg = message_text;
      v_obt := case when st = '42501' and msg like 'new row violates row-level security%' then 'RLS'
                    when st = '42501' and msg like 'permission denied%' then 'ACL'
                    else 'ERROR' end;
      v_det := st || ' | ' || msg;
  end;
  execute 'reset role';
  -- COINCIDENCIA EXACTA: no basta con "no fue PERMITIDA". Un ERROR inesperado nunca coincide con una expectativa.
  v_ok := (p_esperado = 'INFO') or (v_obt = p_esperado);
  insert into tap.rs_results (grupo, caso, esperado, obtenido, detalle, ok)
  values (p_grupo, p_caso, p_esperado, v_obt, v_det, v_ok);
end $$;

-- ===== 0. Precondiciones, privilegios efectivos y catalogo de policies =====
do $$
declare p record;
begin
  assert to_regclass('public.profiles') is not null and to_regclass('public.user_roles') is not null, 'PRECONDICION: faltan profiles/user_roles';
  assert exists (select 1 from pg_roles where rolname = 'authenticated'), 'PRECONDICION: falta el rol authenticated';

  -- Los rechazos esperados como RLS lo son de verdad solo si el rol SI tiene el privilegio sobre la tabla
  assert has_table_privilege('authenticated', 'public.profiles', 'UPDATE') and has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
    '0a PRECONDICION: authenticated necesita UPDATE e INSERT sobre profiles (si no, los rechazos serian ACL y no RLS)';
  -- Desde 0063 anon no puede ejecutar current_user_role(): sus UPDATE sobre profiles fallan por ACL al evaluar el USING
  assert not has_function_privilege('anon', 'public.current_user_role()', 'EXECUTE'),
    '0b PRECONDICION: 0063 aplicada (anon sin EXECUTE sobre current_user_role()); los casos AN1/AN2 dependen de ello';
  assert has_function_privilege('authenticated', 'public.current_user_role()', 'EXECUTE'),
    '0c PRECONDICION: authenticated conserva EXECUTE sobre current_user_role() (0063); las policies lo evaluan';

  select * into p from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own';
  assert p.policyname is not null and p.cmd = 'UPDATE', '1a profiles_update_own existe (UPDATE)';
  -- 1b. igualdad EXACTA (espacios normalizados) con la representación de pg_policies en PostgreSQL 17 observada para
  --     el USING vigente. Una expresión debilitada (p. ej. "... OR true") ya no la supera. Es una comprobación del
  --     TEXTO instalado, no del comportamiento (ver LÍMITES). Si el formato difiere en otra versión/search_path,
  --     falla de forma visible (el mensaje imprime el valor real), nunca pasa en silencio.
  assert regexp_replace(p.qual, '\s+', ' ', 'g') = '((auth.uid() = id) OR (current_user_role() = ''admin''::user_role))',
    '1b USING distinto del esperado (dueño o admin); real: ' || coalesce(p.qual, '<NULL>');
  assert p.permissive = 'PERMISSIVE', '1b2 profiles_update_own debe ser PERMISSIVE; real: ' || coalesce(p.permissive, '<NULL>');
  -- una policy permisiva extra de UPDATE (o ALL) se SUMARÍA con OR al USING y lo abriría: debe existir exactamente una
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE', 'ALL')) = 1,
    '1b3 debe existir exactamente UNA policy aplicable a UPDATE sobre profiles (cmd UPDATE o ALL); reales: '
    || coalesce((select string_agg(policyname || ':' || cmd || ':' || permissive, ', ') from pg_policies
                  where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE', 'ALL')), '<ninguna>');
  assert p.with_check like '%current_user_role%admin%', '1c WITH CHECK conserva la rama de administrador';
  assert p.with_check like '%user_roles%' and p.with_check like '%ur.active%' and p.with_check like '%ur.role%',
    '1d WITH CHECK comprueba user_roles activo del rol destino: ' || p.with_check;
  assert p.with_check like '%is_active%', '1e WITH CHECK conserva la proteccion de is_active (0047)';
  assert p.with_check like '%''admin''%', '1f WITH CHECK conserva la rama de auto-promocion a admin con fila admin activa';

  select * into p from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own';
  assert p.policyname is not null and p.cmd = 'INSERT', '2a profiles_insert_own existe (INSERT)';
  assert p.with_check like '%auth.uid()%' and p.with_check like '%worker%' and p.with_check like '%employer%', '2b WITH CHECK restringe role a worker/employer: ' || p.with_check;
  assert p.with_check not like '%admin%', '2c WITH CHECK no menciona admin: ' || p.with_check;

  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 4,
    '3a profiles sigue con exactamente 4 policies; reales: '
    || coalesce((select string_agg(policyname || ':' || cmd || ':' || permissive, ', ' order by policyname) from pg_policies
                  where schemaname = 'public' and tablename = 'profiles'), '<ninguna>');
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_roles') = 4, '3b user_roles sigue con exactamente 4 policies (no se tocan)';
end $$;

-- ===== Semilla (como superusuario) =====
-- Cuentas nuevas: handle_new_user() crea profiles + la fila user_roles del rol de signup.
-- prevent_zero_active_roles exige >=1 rol activo al terminar cada sentencia: primero se
-- AGREGA el rol nuevo y despues se desactiva el otro.
insert into auth.users (id, raw_user_meta_data) values
  ('fe000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"DU dual (modo worker)"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"PW worker puro"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000003', '{"role":"employer","full_name":"PE employer puro"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"WI worker con employer INACTIVO"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000005', '{"role":"worker","full_name":"AD worker con admin ACTIVO (modo worker)"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000006', '{"role":"worker","full_name":"DM admin DEGRADADO (fila admin inactiva)"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000007', '{"role":"worker","full_name":"AM admin (modo admin)"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000008', '{"role":"worker","full_name":"SU dual SUSPENDIDO"}'::jsonb),
  ('fe000000-0000-4000-8000-000000000009', '{"role":"worker","full_name":"VT victima (worker puro)"}'::jsonb),
  ('fe000000-0000-4000-8000-00000000000a', '{"role":"worker","full_name":"NP sin fila de profiles"}'::jsonb),
  ('fe000000-0000-4000-8000-00000000000b', '{"role":"employer","full_name":"DE dual (modo employer)"}'::jsonb),
  ('fe000000-0000-4000-8000-00000000000c', '{"role":"worker","full_name":"WX modo worker con rol worker INACTIVO"}'::jsonb);
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000001', 'employer', true);   -- DU worker+employer activos
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000004', 'employer', false);  -- WI employer INACTIVO
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000005', 'admin', true);      -- AD admin activo (como lo crea changeUserRole: service role)
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000006', 'admin', false);     -- DM fue admin y lo degradaron
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000007', 'admin', true);      -- AM admin en modo admin
update public.profiles set role = 'admin' where id = 'fe000000-0000-4000-8000-000000000007';
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-000000000008', 'employer', true);   -- SU dual suspendido
update public.profiles set is_active = false where id = 'fe000000-0000-4000-8000-000000000008';
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-00000000000b', 'worker', true);     -- DE dual en modo employer
insert into public.user_roles (user_id, role, active) values ('fe000000-0000-4000-8000-00000000000c', 'employer', true);   -- WX: employer activo...
update public.user_roles set active = false where user_id = 'fe000000-0000-4000-8000-00000000000c' and role = 'worker';     -- ...y su rol worker (el de su modo) INACTIVO: estado preexistente
delete from public.profiles where id = 'fe000000-0000-4000-8000-00000000000a';                                              -- NP: auth.users sin fila de profiles

-- ===== GRUPO A: cambio DIRECTO de profiles.role (PATCH /rest/v1/profiles) =====
-- A-bloqueado: sin poseer el rol destino ACTIVO (el hallazgo). El WITH CHECK rechaza la fila nueva -> RLS.
select tap.rs_case('A', 'A3  worker PURO -> employer (sin fila employer)', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$update public.profiles set role = 'employer' where id = auth.uid()$q$);
select tap.rs_case('A', 'A4  employer PURO -> worker (sin fila worker)', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000003',
  $q$update public.profiles set role = 'worker' where id = auth.uid()$q$);
select tap.rs_case('A', 'A5  worker con employer INACTIVO -> employer', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000004',
  $q$update public.profiles set role = 'employer' where id = auth.uid()$q$);
-- A-protegido desde antes (se conserva): escalada a admin
select tap.rs_case('A', 'A6  worker PURO -> admin (sin fila admin)', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$);
select tap.rs_case('A', 'A7  admin DEGRADADO (fila admin inactiva) -> admin', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000006',
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$);
-- A-permitido: cambios legitimos
select tap.rs_case('A', 'A1  dual worker -> employer (posee ambos activos)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000001',
  $q$update public.profiles set role = 'employer' where id = auth.uid()$q$);
select tap.rs_case('A', 'A2  dual employer -> worker (posee ambos activos)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-00000000000b',
  $q$update public.profiles set role = 'worker' where id = auth.uid()$q$);
select tap.rs_case('A', 'A8  worker con rol admin ACTIVO -> admin (autorizado)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000005',
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$);
select tap.rs_case('A', 'A9  admin (modo admin) -> worker (posee worker activo)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000007',
  $q$update public.profiles set role = 'worker' where id = auth.uid()$q$);
-- rama de administrador INTACTA: changeUserRole() escribe profiles.role de OTRO usuario ANTES de crear su fila user_roles
select tap.rs_case('A', 'A11 admin cambia el rol de OTRO usuario a employer (sin fila employer todavia)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000007',
  $q$update public.profiles set role = 'employer' where id = 'fe000000-0000-4000-8000-000000000009'$q$);
select tap.rs_case('A', 'A12 admin promueve a OTRO usuario a admin (la fila user_roles se crea DESPUES)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000007',
  $q$update public.profiles set role = 'admin' where id = 'fe000000-0000-4000-8000-000000000009'$q$);
-- fila ajena: el USING no la deja ver -> 0 filas, sin error
select tap.rs_case('A', 'A13 usuario normal cambia el rol de OTRO usuario', '0FILAS', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$update public.profiles set role = 'employer' where id = 'fe000000-0000-4000-8000-000000000009'$q$);

-- ===== GRUPO F: flujos legitimos de la app (orden real de operaciones) =====
select tap.rs_case('F', 'F1  onboarding/"Publicar chamba": enableEmployerRole() + switchRoleAction() + ciudad', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$insert into public.user_roles (user_id, role) values (auth.uid(), 'employer');
     update public.profiles set role = 'employer' where id = auth.uid();
     update public.profiles set city = 'Lima' where id = auth.uid()$q$);
select tap.rs_case('F', 'F2  reactiva su rol employer inactivo y luego cambia de modo', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000004',
  $q$update public.user_roles set active = true where user_id = auth.uid() and role = 'employer';
     update public.profiles set role = 'employer' where id = auth.uid()$q$);
select tap.rs_case('F', 'F3  NO se bloquea la edicion normal: modo cuyo rol esta inactivo edita su nombre (rol sin cambio)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-00000000000c',
  $q$update public.profiles set full_name = 'Nuevo nombre', city = 'Lima' where id = auth.uid()$q$);
select tap.rs_case('F', 'F4  re-escribir el mismo rol (worker -> worker) no se bloquea', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$update public.profiles set role = 'worker' where id = auth.uid()$q$);
select tap.rs_case('F', 'F5  desde un modo SIN rol activo no se puede saltar a admin sin poseerlo', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-00000000000c',
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$);

-- ===== GRUPO B: proteccion de is_active (0047) intacta =====
select tap.rs_case('B', 'B1  usuario activo se SUSPENDE a si mismo', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000001',
  $q$update public.profiles set is_active = false where id = auth.uid()$q$);
select tap.rs_case('B', 'B2  usuario suspendido se REACTIVA a si mismo', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000008',
  $q$update public.profiles set is_active = true where id = auth.uid()$q$);
select tap.rs_case('B', 'B3  cambio de rol legitimo + is_active en la MISMA sentencia', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-000000000001',
  $q$update public.profiles set role = 'employer', is_active = false where id = auth.uid()$q$);
select tap.rs_case('B', 'B4  admin suspende a OTRO usuario', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-000000000007',
  $q$update public.profiles set is_active = false where id = 'fe000000-0000-4000-8000-000000000009'$q$);
select tap.rs_case('B', 'B5  usuario normal suspende a OTRO usuario (cross-user is_active)', '0FILAS', 'authenticated', 'fe000000-0000-4000-8000-000000000002',
  $q$update public.profiles set is_active = false where id = 'fe000000-0000-4000-8000-000000000009'$q$);

-- ===== GRUPO E: INSERT en profiles =====
select tap.rs_case('E', 'E1  usuario SIN fila de profiles inserta una con role=admin', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-00000000000a',
  $q$insert into public.profiles (id, role, full_name) values (auth.uid(), 'admin', 'Intento admin')$q$);
select tap.rs_case('E', 'E2  usuario inserta un perfil con el id de OTRO usuario', 'RLS', 'authenticated', 'fe000000-0000-4000-8000-00000000000a',
  $q$insert into public.profiles (id, role, full_name) values ('fe000000-0000-4000-8000-000000000009', 'worker', 'Suplantacion')$q$);
select tap.rs_case('E', 'E3  usuario inserta SU perfil con role=worker (flujo normal de alta)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-00000000000a',
  $q$insert into public.profiles (id, role, full_name) values (auth.uid(), 'worker', 'Alta manual')$q$);
select tap.rs_case('E', 'E3b usuario inserta SU perfil con role=employer (flujo legitimo de alta; la policy no exige fila en user_roles)', 'PERMITIDA', 'authenticated', 'fe000000-0000-4000-8000-00000000000a',
  $q$insert into public.profiles (id, role, full_name) values (auth.uid(), 'employer', 'Alta manual employer')$q$);

-- E4/E5. el alta por signup (trigger handle_new_user, SECURITY DEFINER) NO pasa por profiles_insert_own y sigue
--        sin poder producir un admin aunque el metadata (controlado por el usuario) lo pida
do $$
declare v_admin_role text; v_admin_roles text; v_emp_role text; v_ok boolean;
begin
  insert into auth.users (id, raw_user_meta_data) values ('fe000000-0000-4000-8000-0000000000e4', '{"role":"admin","full_name":"Intento admin en signup"}'::jsonb);
  insert into auth.users (id, raw_user_meta_data) values ('fe000000-0000-4000-8000-0000000000e5', '{"role":"employer","full_name":"Alta employer por signup"}'::jsonb);
  select role::text into v_admin_role from public.profiles where id = 'fe000000-0000-4000-8000-0000000000e4';
  select string_agg(role::text, ',') into v_admin_roles from public.user_roles where user_id = 'fe000000-0000-4000-8000-0000000000e4';
  select role::text into v_emp_role from public.profiles where id = 'fe000000-0000-4000-8000-0000000000e5';
  v_ok := v_admin_role = 'worker' and v_admin_roles = 'worker';
  insert into tap.rs_results (grupo, caso, esperado, obtenido, detalle, ok)
  values ('E', 'E4  signup con metadata role=admin (trigger definer): queda worker, sin fila admin', 'profiles.role=worker ; user_roles=worker',
          'profiles.role=' || v_admin_role || ' ; user_roles=' || v_admin_roles, 'el trigger no se rige por profiles_insert_own', v_ok);
  insert into tap.rs_results (grupo, caso, esperado, obtenido, detalle, ok)
  values ('E', 'E5  signup con metadata role=employer sigue creando un employer', 'profiles.role=employer',
          'profiles.role=' || v_emp_role, 'el alta normal no se rompe', v_emp_role = 'employer');
end $$;

-- ===== GRUPO AN: anon (visitante sin sesion) =====
-- UPDATE: desde 0063 anon no puede ejecutar current_user_role(); el USING de profiles_update_own la evalua,
-- asi que el rechazo es ACL ("permission denied for function"), NO RLS, incluso sin filas coincidentes.
select tap.rs_case('AN', 'AN1 anon intenta cambiar profiles.role de un perfil existente (ACL por 0063, no RLS)', 'ACL', 'anon', null,
  $q$update public.profiles set role = 'employer' where id = 'fe000000-0000-4000-8000-000000000002'$q$);
select tap.rs_case('AN', 'AN2 anon intenta editar cualquier campo de un perfil existente (ACL por 0063, no RLS)', 'ACL', 'anon', null,
  $q$update public.profiles set full_name = 'Hackeado' where id = 'fe000000-0000-4000-8000-000000000002'$q$);
-- INSERT: profiles_insert_own no llama a funciones (auth.uid() es NULL para anon). La expectativa se calcula
-- con el privilegio EFECTIVO de anon: con INSERT -> el WITH CHECK lo rechaza (RLS); sin INSERT -> ACL.
select tap.rs_case('AN', 'AN3 anon inserta un perfil con role=admin', case when has_table_privilege('anon', 'public.profiles', 'INSERT') then 'RLS' else 'ACL' end, 'anon', null,
  $q$insert into public.profiles (id, role, full_name) values ('fe000000-0000-4000-8000-0000000000a1', 'admin', 'Intento admin anon')$q$);
select tap.rs_case('AN', 'AN4 anon inserta un perfil con role=worker (tampoco es un alta valida)', case when has_table_privilege('anon', 'public.profiles', 'INSERT') then 'RLS' else 'ACL' end, 'anon', null,
  $q$insert into public.profiles (id, role, full_name) values ('fe000000-0000-4000-8000-0000000000a2', 'worker', 'Alta anon')$q$);

-- ===== GRUPO SR: service_role (BYPASSRLS, como en Supabase) =====
-- Documenta que las escrituras con la clave de servicio NO pasan por estas policies (por diseno de Supabase):
-- createAdminClient() queda fuera del alcance de 0067. Si el harness no da BYPASSRLS a service_role, se omiten.
select tap.rs_case('SR', 'SR1 service_role cambia profiles.role a un rol sin fila (BYPASSRLS: la policy no interviene)',
  case when (select rolbypassrls from pg_roles where rolname = 'service_role') then 'PERMITIDA' else 'OMITIDO' end, 'service_role', null,
  $q$update public.profiles set role = 'employer' where id = 'fe000000-0000-4000-8000-000000000002'$q$);
select tap.rs_case('SR', 'SR2 service_role cambia is_active de otro usuario (BYPASSRLS)',
  case when (select rolbypassrls from pg_roles where rolname = 'service_role') then 'PERMITIDA' else 'OMITIDO' end, 'service_role', null,
  $q$update public.profiles set is_active = false where id = 'fe000000-0000-4000-8000-000000000002'$q$);
select tap.rs_case('SR', 'SR3 service_role inserta un perfil con role=admin (BYPASSRLS; el alta real usa el trigger)',
  case when (select rolbypassrls from pg_roles where rolname = 'service_role') then 'PERMITIDA' else 'OMITIDO' end, 'service_role', null,
  $q$insert into public.profiles (id, role, full_name) values ('fe000000-0000-4000-8000-00000000000a', 'admin', 'Alta servicio')$q$);

-- ===== GRUPO I/L: decisiones de diseno abiertas y LIMITACION conocida (solo se REGISTRA el comportamiento actual) =====
select tap.rs_case('I', 'I1  [INFO] admin en modo admin se cambia a si mismo a un rol que no posee (employer sin fila)', 'INFO', 'authenticated', 'fe000000-0000-4000-8000-000000000007',
  $q$update public.profiles set role = 'employer' where id = auth.uid()$q$);
select tap.rs_case('I', 'I2  [INFO] usuario SUSPENDIDO cambia su modo (worker -> employer, posee ambos)', 'INFO', 'authenticated', 'fe000000-0000-4000-8000-000000000008',
  $q$update public.profiles set role = 'employer' where id = auth.uid()$q$);
select tap.rs_case('L', 'L1  [INFO] LIMITACION: tras estar en modo employer, desactiva su fila employer (conserva worker activo)', 'INFO', 'authenticated', 'fe000000-0000-4000-8000-00000000000b',
  $q$update public.user_roles set active = false where user_id = auth.uid() and role = 'employer'$q$);
select tap.rs_case('L', 'L2  [INFO] LIMITACION: ...y su profiles.role sigue siendo employer: la policy no interviene al editar con rol sin cambio', 'INFO', 'authenticated', 'fe000000-0000-4000-8000-00000000000b',
  $q$update public.user_roles set active = false where user_id = auth.uid() and role = 'employer';
     update public.profiles set full_name = 'Sigue en modo employer' where id = auth.uid()$q$);

-- ===== RESULTADOS =====
\echo ''
\echo '=============== RESULTADOS POR CASO ==============='
select n, grupo, caso, esperado, obtenido, case when ok then 'OK' else '** FALLA **' end as resultado, detalle
  from tap.rs_results order by n;

\echo ''
\echo '=============== CASOS QUE FALLAN ==============='
select caso, esperado, obtenido, detalle from tap.rs_results where not ok order by n;

do $$
declare v_fallan int; v_lista text; v_total int;
begin
  select count(*), string_agg(split_part(caso, ' ', 1), ', ' order by n) into v_fallan, v_lista from tap.rs_results where not ok;
  select count(*) into v_total from tap.rs_results;
  assert v_total = 39, 'se esperaban 39 casos y se ejecutaron ' || v_total;
  assert v_fallan = 0, 'FALLAN ' || v_fallan || ' caso(s): ' || coalesce(v_lista, '');
end $$;

select 'TODOS LOS ASSERT DE 0067 PASARON' as resultado;
