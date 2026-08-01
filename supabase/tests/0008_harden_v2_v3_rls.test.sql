-- ============================================================
-- Pruebas de regresión — 0008_harden_v2_v3_rls.sql
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
--   for f in supabase/migrations/0001*.sql supabase/migrations/0002*.sql supabase/migrations/0003*.sql \
--            supabase/migrations/0004*.sql supabase/migrations/0005*.sql supabase/migrations/0006*.sql \
--            supabase/migrations/0007*.sql; do
--     psql -d chamby_audit -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_audit -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   # ^ reproduce el estado real de un proyecto Supabase antes de 0008: privilegios
--   #   por defecto en authenticated, con RLS como única barrera.
--   psql -d chamby_audit -v ON_ERROR_STOP=1 -f supabase/migrations/0008_harden_v2_v3_rls.sql
--   # ^ 0008 se aplica AL FINAL: sus REVOKE/GRANT de columna deben ganar sobre el
--   #   GRANT ALL anterior. Este orden es el que reproduce fielmente un despliegue
--   #   real (proyecto ya existente + nueva migración de hardening).
--   psql -d chamby_audit -f supabase/tests/0008_harden_v2_v3_rls.test.sql
--
-- N1, N2, N3, N3b y N5 deben terminar en ERROR (rechazo de RLS o de
-- privilegios de columna). N4 termina en "UPDATE 0" (0 filas — la fila
-- queda excluida por USING, mismo comportamiento que el resto del esquema
-- para un no-participante; no es una excepción SQL, pero la mutación no
-- ocurre). Cada bloque positivo (P1-P8) debe terminar en UPDATE/INSERT 1
-- (aceptado). No se espera limpieza entre bloques: cada uno usa sus
-- propios fixtures.
-- ============================================================

-- ------------------------------------------------------------
-- Fixtures: perfiles
-- ------------------------------------------------------------
insert into auth.users (id, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', '{"role":"employer","full_name":"Empleador Legítimo"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', '{"role":"worker","full_name":"Trabajador Legítimo"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000003', '{"role":"employer","full_name":"Empleador Atacante N1"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', '{"role":"worker","full_name":"Worker Autoaceptador"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000005', '{"role":"employer","full_name":"Empleador Secuestrador"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000006', '{"role":"worker","full_name":"Worker Postulante Real"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000007', '{"role":"employer","full_name":"Empleador Fabricador"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000008', '{"role":"employer","full_name":"Empleador Cancela Abierto"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000009', '{"role":"employer","full_name":"Empleador Cancela EnProgreso"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000010', '{"role":"worker","full_name":"Worker Cancelado EnProgreso"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000011', '{"role":"admin","full_name":"AdminReal"}'::jsonb);
update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000011';

-- ============================================================
-- N1: worker NO puede autoaceptarse (pendiente -> aceptado en su propia
--     postulación, sin acción del empleador)
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
        'Trabajo N1', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');
insert into public.job_applications (id, job_id, worker_id, status)
values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004', 'pendiente');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
update public.job_applications set status = 'aceptado'
  where id = 'c0000000-0000-0000-0000-000000000001';
reset role;

-- ============================================================
-- N2: el empleador NO puede secuestrar una postulación real reescribiendo
--     worker_id hacia sí mismo
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005',
        'Trabajo N2', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');
insert into public.job_applications (id, job_id, worker_id, status)
values ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000006', 'pendiente');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000005';
update public.job_applications set worker_id = 'a0000000-0000-0000-0000-000000000005'
  where id = 'c0000000-0000-0000-0000-000000000002';
reset role;

-- ============================================================
-- N3: el empleador NO puede fabricar assigned_worker_id + status=completado
--     para calificar a un perfil arbitrario sin relación real de trabajo
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007',
        'Trabajo N3', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000007';
update public.jobs
  set status = 'completado', assigned_worker_id = 'a0000000-0000-0000-0000-000000000002'
  where id = 'b0000000-0000-0000-0000-000000000003';
reset role;

-- N3b: aunque N3 hubiera colado el status sin el assigned_worker_id, la
-- calificación sigue sin poder insertarse porque rated_id no matchea
-- ningún assigned_worker_id real del job (sigue NULL).
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000007';
insert into public.ratings (job_id, rater_id, rated_id, score)
values ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007',
        'a0000000-0000-0000-0000-000000000002', 5);
reset role;

-- ============================================================
-- N4: un tercero que no es worker ni empleador del job no puede tocar la
--     postulación (control de que la USING sigue exigiendo pertenencia)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000006'; -- worker de N2, ajeno al job/postulación N1
update public.job_applications set status = 'aceptado'
  where id = 'c0000000-0000-0000-0000-000000000001';
reset role;

-- ============================================================
-- N5: el empleador no puede reescribir hired_at directamente
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
update public.jobs set hired_at = now() where id = 'b0000000-0000-0000-0000-000000000001';
reset role;

-- ============================================================
-- P1-P3: ciclo completo legítimo — postular, aceptar (trigger asigna
-- worker y pasa a en_progreso), completar, calificarse mutuamente
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
        'Trabajo Legítimo', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

-- P1: worker postula a un trabajo ajeno
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
insert into public.job_applications (id, job_id, worker_id, status)
values ('c0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000010',
        'a0000000-0000-0000-0000-000000000002', 'pendiente');
reset role;

-- P2: el empleador acepta al postulante real (pendiente -> aceptado)
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
update public.job_applications set status = 'aceptado'
  where id = 'c0000000-0000-0000-0000-000000000010';
reset role;

-- Verifica que el trigger asignó al worker y pasó el job a en_progreso
select assigned_worker_id, status, hired_at from public.jobs
  where id = 'b0000000-0000-0000-0000-000000000010';

-- P3: el empleador marca el trabajo como completado (en_progreso -> completado)
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
update public.jobs set status = 'completado', completed_at = now()
  where id = 'b0000000-0000-0000-0000-000000000010';
reset role;

-- P4: el empleador califica al worker real asignado
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
insert into public.ratings (job_id, rater_id, rated_id, score)
values ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002', 5);
reset role;

-- P5: el worker califica al empleador real
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
insert into public.ratings (job_id, rater_id, rated_id, score)
values ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001', 5);
reset role;

-- ============================================================
-- P6: el empleador SÍ puede cancelar un trabajo abierto (sin postulantes)
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000008',
        'Trabajo Cancelable Abierto', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000008';
update public.jobs set status = 'cancelado', cancelled_at = now()
  where id = 'b0000000-0000-0000-0000-000000000020';
reset role;

-- ============================================================
-- P7: el empleador SÍ puede cancelar un trabajo en_progreso (con worker
--     real ya asignado por el trigger)
-- ============================================================
insert into public.jobs (id, employer_id, title, description, category, city, status)
values ('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000009',
        'Trabajo Cancelable EnProgreso', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000010';
insert into public.job_applications (id, job_id, worker_id, status)
values ('c0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000021',
        'a0000000-0000-0000-0000-000000000010', 'pendiente');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000009';
update public.job_applications set status = 'aceptado'
  where id = 'c0000000-0000-0000-0000-000000000021';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000009';
update public.jobs set status = 'cancelado', cancelled_at = now()
  where id = 'b0000000-0000-0000-0000-000000000021';
reset role;

-- ============================================================
-- P8: admin real conserva el override total de status (moderación libre,
--     ya usada por adminUpdateJobStatus/AdminJobRow)
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000011';
update public.jobs set status = 'abierto' where id = 'b0000000-0000-0000-0000-000000000020';
reset role;
