-- ============================================================
-- Pruebas de regresión — 0062_harden_jobs_insert.sql
-- ============================================================
-- Cómo ejecutar (contra un Postgres 16/17 desechable, NUNCA contra el
-- proyecto Supabase real): mismo setup que
-- supabase/tests/0048_protect_job_deletion.test.sql (roles anon/
-- authenticated/service_role, esquemas auth/storage simulados, GRANT
-- amplios de aprovisionamiento por defecto de Supabase, auth.uid() leyendo
-- request.jwt.claim.sub), con las migraciones 0001-0061 en orden y 0062 al
-- final — el bloque de GRANT amplios debe ejecutarse ANTES de aplicar 0062,
-- porque 0062 debe "ganar" como última palabra sobre los privilegios de
-- INSERT de jobs, igual que en Production.
--
-- NO ejecutado en la fase de implementación — este entorno de desarrollo
-- no tiene un Postgres local disponible (ni psql ni Docker), y ejecutarlo
-- contra Production está explícitamente prohibido. Los resultados
-- "Esperado" de abajo son lo que la suite debe producir al correrse; no
-- son resultados observados.
--
-- Nota de ejecución: los bloques "Esperado: ERROR ..." fallan
-- deliberadamente; en psql sin `-v ON_ERROR_STOP=1` cada sentencia es su
-- propia transacción implícita y un error no aborta el resto del script.
--
-- Capas que se prueban por separado:
--   · Sección E: los PRIVILEGIOS por columna rechazan (42501 "permission
--     denied for table jobs") toda columna fuera de las 12 de publicación.
--   · Sección F: la POLICY rechaza (42501 "violates row-level security
--     policy") aun si, por error, se concediera INSERT sobre esas columnas
--     — se concede dentro de una transacción que termina en ROLLBACK.
-- ============================================================

insert into auth.users (id, raw_user_meta_data) values
  ('f3000000-0000-4000-8000-000000000001', '{"full_name":"Beto Employer","role":"employer"}'::jsonb),
  ('f3000000-0000-4000-8000-000000000002', '{"full_name":"Ana Worker","role":"worker"}'::jsonb);

-- ============================================================
-- A. PRIVILEGIOS — tabla y columnas (como superusuario)
-- ============================================================
\echo '--- A1. INSERT de tabla (esperado: anon=f, authenticated=f, service_role=t) ---'
select r.rolname, has_table_privilege(r.rolname, 'public.jobs', 'INSERT') as can_insert_table
from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
order by r.rolname;

\echo '--- A2. INSERT por columna para authenticated (esperado: t SOLO en las 12 de publicación, f en las demás) ---'
select c.column_name,
       has_column_privilege('authenticated', 'public.jobs', c.column_name, 'INSERT') as authenticated_insert
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'jobs'
order by authenticated_insert desc, c.column_name;

\echo '--- A3. INSERT por columna para anon (esperado: 0 filas con true) ---'
select c.column_name
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'jobs'
  and has_column_privilege('anon', 'public.jobs', c.column_name, 'INSERT');

\echo '--- A4. PUBLIC sin INSERT sobre jobs (esperado: 0 filas) ---'
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'jobs'
  and grantee = 'PUBLIC' and privilege_type = 'INSERT';

-- ============================================================
-- B. POLICIES — solo cambió la de INSERT
-- ============================================================
\echo '--- B1. única policy de INSERT = jobs_insert_employer (esperado: 1 fila) ---'
select policyname from pg_policies
where schemaname = 'public' and tablename = 'jobs' and cmd = 'INSERT';

\echo '--- B2. WITH CHECK contiene las condiciones originales y el estado inicial (revisar a ojo) ---'
select with_check from pg_policies
where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_insert_employer';

\echo '--- B3. policies de SELECT/UPDATE/DELETE intactas (esperado: jobs_delete_owner_or_admin, jobs_insert_employer, jobs_select_all, jobs_update_owner_or_admin) ---'
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'jobs' order by policyname;

-- ============================================================
-- C. ANON no puede insertar
-- ============================================================
set role anon;
select set_config('request.jwt.claim.sub', '', false);
\echo '--- C1. anon intenta crear un job (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-ANON', 'Descripción de prueba larga', 'Gasfitero', 'Lima');
reset role;

-- ============================================================
-- D. authenticated crea un job LEGÍTIMO
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);

\echo '--- D1. employer crea un job con las 12 columnas + RETURNING id, como createJob().insert().select("id").single() (esperado: 1 fila con id) ---'
insert into public.jobs
  (employer_id, title, description, category, city, address, pay_amount, pay_type, positions_needed, department, province, district)
values
  ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-LEGIT', 'Descripción de prueba larga', 'Gasfitero', 'Pimentel',
   'Av. Prueba 123', 80.50, 'por_dia', 2, 'Lambayeque', 'Chiclayo', 'Pimentel')
returning id;

\echo '--- D2. mismo flujo SIN address ni pay_amount (opcionales; esperado: 1 fila con id) ---'
insert into public.jobs (employer_id, title, description, category, city, pay_type, positions_needed, department, province, district)
values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-MIN', 'Descripción de prueba larga', 'Gasfitero', 'Pimentel',
        'fijo', 1, 'Lambayeque', 'Chiclayo', 'Pimentel')
returning id;

\echo '--- D3. un employer NO puede crear un job a nombre de otro (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city)
  values ('f3000000-0000-4000-8000-000000000002', 'JOB-T62-AJENO', 'Descripción de prueba larga', 'Gasfitero', 'Lima');
reset role;

\echo '--- D4. estado inicial tomado de los DEFAULT (esperado: status=abierto y el resto NULL, para ambos jobs) ---'
select title, status, assigned_worker_id, hired_at, completed_at, cancelled_at,
       worker_reported_finished_at, employer_confirmed_at, scheduled_start_at, scheduled_end_at, starts_at
from public.jobs where title in ('JOB-T62-LEGIT', 'JOB-T62-MIN') order by title;

-- ============================================================
-- E. authenticated NO puede insertar columnas fuera de las 12
--    (rechazo por PRIVILEGIO de columna, antes de evaluar la policy)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);

\echo '--- E1. assigned_worker_id (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, assigned_worker_id)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E1', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'f3000000-0000-4000-8000-000000000002');
\echo '--- E2. status = completado (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, status)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E2', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'completado');
\echo '--- E3. status = en_progreso (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, status)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E3', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'en_progreso');
\echo '--- E4. hired_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, hired_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E4', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
\echo '--- E5. scheduled_start_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, scheduled_start_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E5', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now() + interval '1 day');
\echo '--- E6. scheduled_end_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, scheduled_end_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E6', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now() + interval '2 days');
\echo '--- E7. completed_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, completed_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E7', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
\echo '--- E8. cancelled_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, cancelled_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E8', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
\echo '--- E9. worker_reported_finished_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, worker_reported_finished_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E9', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
\echo '--- E10. employer_confirmed_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, employer_confirmed_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E10', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
\echo '--- E11. starts_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, starts_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E11', 'Descripción de prueba larga', 'Gasfitero', 'Lima', current_date);
\echo '--- E12. id (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (id, employer_id, title, description, category, city)
  values ('f3999999-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'JOB-T62-E12', 'Descripción de prueba larga', 'Gasfitero', 'Lima');
\echo '--- E13. created_at en el futuro (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, created_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E13', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now() + interval '10 years');
\echo '--- E14. updated_at (esperado: ERROR permission denied for table jobs) ---'
insert into public.jobs (employer_id, title, description, category, city, updated_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-E14', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now() + interval '10 years');
reset role;

\echo '--- E15. ninguno de esos intentos dejó filas (esperado: 0 filas) ---'
select title from public.jobs where title like 'JOB-T62-E%' or title in ('JOB-T62-ANON', 'JOB-T62-AJENO');

-- ============================================================
-- F. SEGUNDA BARRERA — la policy, aun con INSERT concedido por error
--    (todo dentro de una transacción que termina en ROLLBACK, para no
--    alterar los privilegios de la suite)
-- ============================================================
begin;
grant insert (status, assigned_worker_id, hired_at, completed_at, cancelled_at,
              worker_reported_finished_at, employer_confirmed_at,
              scheduled_start_at, scheduled_end_at, starts_at)
  on public.jobs to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);

\echo '--- F1. (con grant forzado) status = completado (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, status)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F1', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'completado');
rollback;

-- Cada intento es una transacción independiente: un error aborta la transacción en curso.
begin;
grant insert (assigned_worker_id) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F2. (con grant forzado) assigned_worker_id (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, assigned_worker_id)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F2', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'f3000000-0000-4000-8000-000000000002');
rollback;

begin;
grant insert (hired_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F3. (con grant forzado) hired_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, hired_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F3', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
rollback;

begin;
grant insert (scheduled_start_at, scheduled_end_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F4. (con grant forzado) scheduled_start_at + scheduled_end_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, scheduled_start_at, scheduled_end_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F4', 'Descripción de prueba larga', 'Gasfitero', 'Lima',
          now() + interval '1 day', now() + interval '1 day 2 hours');
rollback;

begin;
grant insert (worker_reported_finished_at, employer_confirmed_at, cancelled_at, starts_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F5. (con grant forzado) worker_reported_finished_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, worker_reported_finished_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F5', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
rollback;

begin;
grant insert (employer_confirmed_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F6. (con grant forzado) employer_confirmed_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, employer_confirmed_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F6', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
rollback;

begin;
grant insert (cancelled_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F7. (con grant forzado) cancelled_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, cancelled_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F7', 'Descripción de prueba larga', 'Gasfitero', 'Lima', now());
rollback;

begin;
grant insert (starts_at) on public.jobs to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
\echo '--- F8. (con grant forzado) starts_at (esperado: ERROR violates row-level security policy) ---'
insert into public.jobs (employer_id, title, description, category, city, starts_at)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-F8', 'Descripción de prueba larga', 'Gasfitero', 'Lima', current_date);
rollback;

\echo '--- F9. el ROLLBACK dejó los privilegios intactos (esperado: assigned_worker_id=f, status=f, starts_at=f) ---'
select has_column_privilege('authenticated', 'public.jobs', 'assigned_worker_id', 'INSERT') as assigned_worker_id,
       has_column_privilege('authenticated', 'public.jobs', 'status', 'INSERT') as status,
       has_column_privilege('authenticated', 'public.jobs', 'starts_at', 'INSERT') as starts_at;

-- ============================================================
-- G. FLUJO POSTERIOR — la aceptación sigue escribiendo assigned_worker_id,
--    status, hired_at y scheduled_* vía handle_application_accepted()
--    (SECURITY DEFINER, corre como dueño; no depende de INSERT).
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
insert into public.jobs (employer_id, title, description, category, city, pay_type, positions_needed, department, province, district)
values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-ACEPTACION', 'Descripción de prueba larga', 'Gasfitero', 'Pimentel',
        'fijo', 1, 'Lambayeque', 'Chiclayo', 'Pimentel');

-- El trabajador postula
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000002', false);
insert into public.job_applications (job_id, worker_id)
  select id, 'f3000000-0000-4000-8000-000000000002' from public.jobs where title = 'JOB-T62-ACEPTACION';

-- El empleador propone horario (0054)
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
update public.job_applications
  set proposed_start_at = '2030-01-15 09:00:00+00', proposed_end_at = '2030-01-15 12:00:00+00'
  where job_id = (select id from public.jobs where title = 'JOB-T62-ACEPTACION');

-- El trabajador confirma
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000002', false);
update public.job_applications set worker_schedule_confirmed_at = now()
  where job_id = (select id from public.jobs where title = 'JOB-T62-ACEPTACION');

-- El empleador acepta -> trg_application_accepted -> handle_application_accepted()
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
update public.job_applications set status = 'aceptado'
  where job_id = (select id from public.jobs where title = 'JOB-T62-ACEPTACION');
reset role;

\echo '--- G1. tras aceptar (esperado: assigned_worker_id = ...0002, status = en_progreso, hired_at no nulo, scheduled_start_at = 2030-01-15 09:00+00, scheduled_end_at = 2030-01-15 12:00+00) ---'
select assigned_worker_id, status, hired_at is not null as tiene_hired_at, scheduled_start_at, scheduled_end_at
from public.jobs where title = 'JOB-T62-ACEPTACION';

\echo '--- G2. pero el cliente sigue sin poder escribir esas columnas directo con UPDATE (esperado: ERROR permission denied for table jobs) ---'
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
update public.jobs set assigned_worker_id = 'f3000000-0000-4000-8000-000000000001' where title = 'JOB-T62-LEGIT';
reset role;

\echo '--- G3. ni scheduled_* por UPDATE directo (esperado: ERROR permission denied for table jobs) ---'
set role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', false);
update public.jobs set scheduled_start_at = now() where title = 'JOB-T62-LEGIT';
reset role;

-- ============================================================
-- H. service_role/postgres no se ven afectados
-- ============================================================
\echo '--- H1. un INSERT como superusuario/service sigue funcionando (esperado: 1 fila; es lo que usan seed.sql y las suites SQL) ---'
insert into public.jobs (employer_id, title, description, category, city, status)
  values ('f3000000-0000-4000-8000-000000000001', 'JOB-T62-SUPERUSER', 'Descripción de prueba larga', 'Gasfitero', 'Lima', 'completado')
  returning title, status;
