-- ============================================================
-- CHAMBY — Fase 8: suite SQL reproducible de seguridad de Reports
-- ============================================================
-- Cubre, contra un Postgres 16 real y desechable (NUNCA contra el
-- proyecto Supabase de producción ni de staging sin identificar):
--
--   Parte E — RLS de reports / report_evidence / moderation_actions /
--             reporter_reports_view (reportante, reportado, admin, anon)
--   Parte G — triggers de notificaciones (0023): status_changed y
--             moderation_action, con verificación de no-fuga de datos
--   Parte H — máquina de estados: confirma dónde se aplica realmente
--             (server-side, admin-reports.ts) y qué permite/no permite
--             la base de datos por sí sola
--   Parte I — column-level GRANT/REVOKE de `reports`, verificado contra
--             information_schema (no por lectura de SQL)
--   Parte D — F6-02: los 7 escenarios de reports_no_duplicate_active_job
--             (0025), incluyendo la regresión del caso 'user' (0019)
--   Parte C — F6-01: SOLO la parte que una suite de una sola conexión
--             puede probar (conteo/excepción/rollback secuencial). La
--             garantía de concurrencia real (dos conexiones simultáneas)
--             NO se puede demostrar aquí — ver
--             supabase/tests/phase8_concurrency_f6_01.sh, que sí abre
--             dos conexiones reales pero requiere un Postgres accesible
--             desde este entorno (no disponible al escribir esto).
--
-- Lo que este archivo NO cubre (ver supabase/tests/phase8_storage_rls.md):
--   Parte F — Storage (bucket report-evidence, signed URLs, upload
--             ownership) requiere un cliente Supabase autenticado real
--             (Auth + Storage API), no solo SQL puro contra Postgres.
--
-- ------------------------------------------------------------
-- CÓMO EJECUTAR (contra un Postgres 16 desechable — mismo patrón que
-- supabase/tests/0008_harden_v2_v3_rls.test.sql y 0014_multi_role.test.sql,
-- extendido hasta 0025):
--
--   createdb chamby_reports_phase8
--   psql -d chamby_reports_phase8 -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION \"uuid-ossp\";"
--   psql -d chamby_reports_phase8 -c "CREATE SCHEMA auth;"
--   psql -d chamby_reports_phase8 -c "CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
--   psql -d chamby_reports_phase8 -c "CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;"
--   psql -d chamby_reports_phase8 -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT current_setting('request.jwt.claim.sub', true)::uuid \$\$ LANGUAGE sql STABLE;"
--   psql -d chamby_reports_phase8 -c "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT SELECT ON auth.users TO authenticated, anon;"
--   for f in supabase/migrations/0*.sql; do   # 0001 .. 0025, EN ORDEN
--     psql -d chamby_reports_phase8 -v ON_ERROR_STOP=1 -f "$f"
--   done
--   psql -d chamby_reports_phase8 -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
--   # ^ reproduce privilegios por defecto de un proyecto Supabase ANTES de
--   #   que las migraciones de hardening (0008, 0013, 0019, 0020...) corran
--   #   sus propios REVOKE/GRANT de columna. Por eso este GRANT ALL va
--   #   ANTES del loop de arriba en un despliegue real (proyecto ya
--   #   existente), pero aquí el loop ya aplicó 0001-0025 completas, así
--   #   que este GRANT ALL se re-emite DESPUÉS para simular un rol
--   #   `authenticated` con privilegios de tabla completos y dejar que
--   #   sean las migraciones (ya aplicadas) las que los restrinjan on
--   #   REVOKE. Para que el REVOKE de 0019/0020/0024's SECURITY DEFINER
--   #   funcione igual que en producción, re-aplica el REVOKE/GRANT final
--   #   de columna explícitamente:
--   psql -d chamby_reports_phase8 -c "revoke update on public.reports from authenticated; grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at) on public.reports to authenticated;"
--   psql -d chamby_reports_phase8 -v ON_ERROR_STOP=1 -f supabase/tests/reports_security_phase8.sql
--
-- Lectura de resultados: cada bloque negativo (N-*) debe terminar en
-- ERROR (RLS deniega) o "UPDATE 0"/"INSERT 0"/0 filas (la policy excluye
-- la fila sin lanzar excepción — mismo comportamiento documentado en
-- 0008/0014). Cada bloque positivo (P-*) debe terminar en éxito con 1+
-- filas afectadas/devueltas. No hay limpieza entre bloques: cada uno usa
-- fixtures propios con prefijo f/f1/f2 para no chocar con datos reales.
-- ============================================================


-- ------------------------------------------------------------
-- FIXTURES
-- ------------------------------------------------------------
-- Todos los IDs de esta suite empiezan con 'f0'/'f1' (Fase 8) —
-- claramente identificables y nunca generados por gen_random_uuid()
-- real, para poder distinguir datos de prueba de datos reales si esta
-- suite alguna vez corriera por error contra una base con datos reales
-- (no debería — ver instrucciones arriba).
insert into auth.users (id, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000001', '{"role":"worker","full_name":"Fase8 Reportante"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000002', '{"role":"worker","full_name":"Fase8 Reportante Dos"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000003', '{"role":"worker","full_name":"Fase8 Usuario Reportado"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000004', '{"role":"worker","full_name":"Fase8 Tercero Ajeno"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000005', '{"role":"admin","full_name":"Fase8 Admin"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000006', '{"role":"employer","full_name":"Fase8 Empleador"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000007', '{"role":"admin","full_name":"Fase8 Admin Dos"}'::jsonb);
update public.profiles set role = 'admin' where id in (
  'f0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000007'
);

insert into public.jobs (id, employer_id, title, description, category, city, status)
values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006',
   'Fase8 Oferta Reportable', 'Descripción de prueba con más de 20 caracteres', 'Categoria', 'Lima', 'abierto');

-- IDs de reportes que se irán llenando en cada sección (declarados aquí
-- como comentario de referencia, no como variables — psql plano no
-- soporta variables de sesión persistentes entre \set sin -v; cada
-- bloque vuelve a seleccionar por sus propios criterios conocidos).


-- ============================================================
-- PARTE E — RLS: public.reports
-- ============================================================

-- ------------------------------------------------------------
-- P-REP-1: el reportante SÍ puede crear su propio reporte (user target),
-- en estado inicial limpio.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status)
values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'user', 'f0000000-0000-4000-8000-000000000003', 'harassment', 'Descripción de prueba Fase 8', 'pending');
reset role;

-- ------------------------------------------------------------
-- N-REP-1: el reportante NO puede suplantar reporter_id (spoof de otro
-- usuario) — debe rechazar aunque el resto del INSERT sea válido.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status)
values
  ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002',
   'user', 'f0000000-0000-4000-8000-000000000003', 'spam', 'Intento de suplantación', 'pending');
reset role;

-- ------------------------------------------------------------
-- N-REP-2: el reportante NO puede insertar ya con status != 'pending'
-- (evita crear un reporte "pre-resuelto" o auto-descartado).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status)
values
  ('f2000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
   'user', 'f0000000-0000-4000-8000-000000000003', 'spam', 'Intento de status manipulado', 'resolved');
reset role;

-- ------------------------------------------------------------
-- N-REP-3: el reportante NO puede insertar con admin_notes/reviewed_by
-- precargados.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status, admin_notes, reviewed_by)
values
  ('f2000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001',
   'user', 'f0000000-0000-4000-8000-000000000003', 'spam', 'Intento de precarga admin', 'pending',
   'nota falsa', 'f0000000-0000-4000-8000-000000000005');
reset role;

-- ------------------------------------------------------------
-- N-REP-4: la persona REPORTADA no puede leer el reporte contra sí misma
-- (no es reporter_id, no es admin) — debe devolver 0 filas, no error.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
select id, reason, status from public.reports where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-5: un tercero sin relación con el reporte tampoco lo puede leer.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000004';
select id from public.reports where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-6 (ANON): un usuario no autenticado no puede leer ningún reporte.
-- ------------------------------------------------------------
set role anon;
select id from public.reports where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- P-REP-2: el reportante SÍ puede leer su propio reporte completo (fila).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
select id, reason, status, admin_notes, reviewed_by from public.reports
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- P-REP-3: admin SÍ puede leer cualquier reporte, incluyendo admin_notes.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
select id, reason, status, admin_notes, reviewed_by from public.reports
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-7: el reportante NO tiene ninguna policy UPDATE que lo alcance —
-- ni siquiera para tocar su propio reporte (por diseño: reports_update_
-- admin es la única policy UPDATE y exige role='admin').
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
update public.reports set description = 'intento de edición propia'
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- P-REP-4: admin SÍ puede actualizar las columnas de revisión
-- (status/reviewed_by/reviewed_at/admin_notes/updated_at).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports
  set status = 'under_review', reviewed_by = 'f0000000-0000-4000-8000-000000000005',
      reviewed_at = now(), admin_notes = 'en revisión', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-8 (Parte I): admin NO puede reescribir reporter_id — bloqueado a
-- nivel de COLUMNA (REVOKE), no de fila, así que debe fallar aunque la
-- policy USING/WITH CHECK de rol admin sí lo permitiría.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set reporter_id = 'f0000000-0000-4000-8000-000000000002'
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-9 (Parte I): admin NO puede reescribir target_type/reported_user_id/
-- reported_job_id/related_job_id/created_at — mismo candado de columna.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set target_type = 'job' where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set reported_user_id = 'f0000000-0000-4000-8000-000000000004'
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set created_at = now() - interval '30 days'
  where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-REP-10: nadie (ni admin) puede borrar un reporte — sin policy DELETE.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
delete from public.reports where id = 'f2000000-0000-4000-8000-000000000001';
reset role;


-- ============================================================
-- PARTE E — RLS: public.reporter_reports_view
-- ============================================================

-- ------------------------------------------------------------
-- P-VIEW-1: el reportante ve su reporte vía la vista, incluyendo
-- description/reason/status, SIN admin_notes/reviewed_by/reviewed_at
-- (no existen como columnas en la vista — no es un tema de permiso,
-- literalmente no se pueden seleccionar).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
select * from public.reporter_reports_view where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- Confirmación explícita de que admin_notes/reviewed_by no son
-- columnas seleccionables de la vista (debe fallar con "column does not
-- exist", no con un valor NULL — la ausencia debe ser estructural).
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
select admin_notes from public.reporter_reports_view where id = 'f2000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-VIEW-1: otro reportante no ve esta fila vía la vista (security_invoker
-- respeta reports_select_own_or_admin evaluada con SUS credenciales).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
select id from public.reporter_reports_view where id = 'f2000000-0000-4000-8000-000000000001';
reset role;


-- ============================================================
-- PARTE E — RLS: public.report_evidence
-- ============================================================
-- El reporte f2...0001 quedó en 'under_review' tras P-REP-4 — se usa uno
-- NUEVO en 'pending' para las pruebas de evidencia que requieren ese estado.
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status)
values
  ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000001',
   'user', 'f0000000-0000-4000-8000-000000000003', 'scam_fraud', 'Reporte para pruebas de evidencia', 'pending');
reset role;

-- ------------------------------------------------------------
-- P-EVID-1: el reportante SÍ puede adjuntar evidencia a su propio
-- reporte mientras sigue 'pending'.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.report_evidence
  (id, report_id, storage_path, file_name, content_type, uploaded_by)
values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000010',
   'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000010/prueba1.jpg',
   'prueba1.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001');
reset role;

-- ------------------------------------------------------------
-- N-EVID-1: el reportante NO puede adjuntar evidencia a un reporte que
-- ya no está 'pending' (usamos f2...0001, que quedó 'under_review').
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.report_evidence
  (id, report_id, storage_path, file_name, content_type, uploaded_by)
values
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/tardio.jpg',
   'tardio.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001');
reset role;

-- ------------------------------------------------------------
-- N-EVID-2: un usuario NO puede adjuntar evidencia al reporte de OTRO
-- (uploaded_by=auth.uid() pasa el check, pero el reporte no le pertenece).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
insert into public.report_evidence
  (id, report_id, storage_path, file_name, content_type, uploaded_by)
values
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000010',
   'f0000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000010/ajeno.jpg',
   'ajeno.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000002');
reset role;

-- ------------------------------------------------------------
-- N-EVID-3: el usuario REPORTADO no puede leer la evidencia en su contra
-- (no es uploaded_by, no es admin).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
select id, file_name from public.report_evidence where report_id = 'f2000000-0000-4000-8000-000000000010';
reset role;

-- ------------------------------------------------------------
-- N-EVID-4 (ANON): tampoco puede leer evidencia sin sesión.
-- ------------------------------------------------------------
set role anon;
select id from public.report_evidence where report_id = 'f2000000-0000-4000-8000-000000000010';
reset role;

-- ------------------------------------------------------------
-- P-EVID-2: admin SÍ puede leer cualquier evidencia.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
select id, file_name from public.report_evidence where report_id = 'f2000000-0000-4000-8000-000000000010';
reset role;

-- ------------------------------------------------------------
-- N-EVID-5: no existe policy UPDATE para report_evidence — cualquier
-- intento de modificar una fila ya subida debe fallar, incluso el
-- propio dueño.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
update public.report_evidence set file_name = 'renombrado.jpg'
  where id = 'f3000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- P-EVID-3: el dueño SÍ puede borrar su propia evidencia mientras el
-- reporte sigue 'pending' (0022).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
delete from public.report_evidence where id = 'f3000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-EVID-6: una vez que el reporte pasa a 'under_review', el dueño ya NO
-- puede borrar evidencia existente (0022: condición de estado en DELETE).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.report_evidence
  (id, report_id, storage_path, file_name, content_type, uploaded_by)
values
  ('f3000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000010',
   'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000010/pre-review.jpg',
   'pre-review.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'under_review' where id = 'f2000000-0000-4000-8000-000000000010';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
delete from public.report_evidence where id = 'f3000000-0000-4000-8000-000000000004';
reset role;
-- Debe ser DELETE 0 (no error, igual que N4 en 0008): la fila sigue
-- existiendo porque el reporte ya no cumple status='pending'.
select count(*) from public.report_evidence where id = 'f3000000-0000-4000-8000-000000000004';
-- Debe ser 1.


-- ============================================================
-- PARTE E — RLS: public.moderation_actions
-- ============================================================

-- ------------------------------------------------------------
-- N-MOD-1: un usuario normal (no admin) no puede leer moderation_actions.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
select id from public.moderation_actions;
reset role;

-- ------------------------------------------------------------
-- N-MOD-2: un usuario normal no puede insertar una acción de moderación.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000003', 'note_added');
reset role;

-- ------------------------------------------------------------
-- N-MOD-3: un admin NO puede insertar una acción atribuida a OTRO admin
-- (admin_id debe ser auth.uid(), no cualquier admin real).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000007',
        'f0000000-0000-4000-8000-000000000003', 'note_added');
reset role;

-- ------------------------------------------------------------
-- P-MOD-1: admin SÍ puede registrar una acción atribuida a sí mismo.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
insert into public.moderation_actions (id, report_id, admin_id, target_user_id, action_type, reason)
values ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000010',
        'f0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000003',
        'note_added', 'nota interna de prueba');
reset role;

-- ------------------------------------------------------------
-- P-MOD-2: admin SÍ puede leer moderation_actions.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
select id, action_type from public.moderation_actions where id = 'f4000000-0000-4000-8000-000000000001';
reset role;

-- ------------------------------------------------------------
-- N-MOD-4: append-only real — ni siquiera admin puede UPDATE/DELETE.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.moderation_actions set reason = 'editado' where id = 'f4000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
delete from public.moderation_actions where id = 'f4000000-0000-4000-8000-000000000001';
reset role;


-- ============================================================
-- PARTE I — COLUMN GRANTS (verificado contra information_schema, no por
-- lectura de SQL de la migración)
-- ============================================================
-- Debe devolver EXACTAMENTE: admin_notes, reviewed_at, reviewed_by,
-- status, updated_at — ni una columna más, ni una menos. Si
-- reporter_id/target_type/reported_user_id/reported_job_id/
-- related_job_id/created_at aparecieran aquí, sería un hallazgo CRÍTICO
-- (columna inmutable expuesta a UPDATE por `authenticated`).
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'reports'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
order by column_name;

-- report_evidence: no debe haber NINGUNA fila (no hay policy UPDATE en
-- absoluto, ver 0019 — pero el GRANT/REVOKE de tabla es otro mecanismo:
-- confirmamos aquí si el rol siquiera tiene el privilegio de UPDATE
-- concedido a nivel de tabla/columna, independientemente de RLS).
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'report_evidence'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
order by column_name;


-- ============================================================
-- PARTE H — MÁQUINA DE ESTADOS: dónde se aplica realmente
-- ============================================================
-- admin-reports.ts valida REPORT_STATUS_TRANSITIONS en la Server Action
-- (updateReportStatus(), src/lib/actions/admin-reports.ts:282) ANTES de
-- construir el UPDATE — la base de datos NO tiene ningún CHECK/trigger
-- que impida una transición inválida a nivel de fila. Este bloque lo
-- confirma empíricamente: si el UPDATE de abajo tiene ÉXITO, confirma
-- que el único guardián real de la máquina de estados es la capa de
-- aplicación (Next.js), no Postgres — coherente con el patrón ya
-- documentado en CLAUDE.md ("RLS restringe QUIÉN, la Server Action debe
-- restringir QUÉ valor"), pero deja explícito que cualquier acceso
-- admin fuera del flujo de la app (PostgREST directo con el JWT de un
-- admin, un bug en otra Server Action futura) podría reabrir un reporte
-- 'resolved'/'dismissed' — algo que el diseño dice explícitamente que
-- NUNCA debe ocurrir (ver prompt Fase 3: "explícitamente NO reabrir").
--
-- N-STATE-1 (según el DISEÑO de producto, esta transición debería ser
-- imposible; a nivel de Postgres puro, NO lo es — ver conclusión abajo)
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'pending', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000001'; -- estaba en 'under_review' desde P-REP-4
reset role;
select id, status from public.reports where id = 'f2000000-0000-4000-8000-000000000001';
-- Si status = 'pending' aquí, la base de datos permitió under_review->pending
-- (transición que REPORT_STATUS_TRANSITIONS PROHÍBE en TypeScript) sin
-- ningún error — confirma que el único enforcement real es applicativo.


-- ============================================================
-- PARTE G — TRIGGERS DE NOTIFICACIONES (0023)
-- ============================================================

-- ------------------------------------------------------------
-- P-NOTIF-1: pending -> under_review dispara notify_report_status_changed()
-- hacia el REPORTANTE (nunca hacia el reportado).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'under_review', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000010'; -- estaba 'pending'
reset role;

select user_id, type, title, body, data
from public.notifications
where type = 'report_status_update' and (data->>'reportId') = 'f2000000-0000-4000-8000-000000000010'
order by created_at desc limit 1;
-- Debe: user_id = f0000000-...0001 (el reportante, NUNCA el reportado
-- f0000000-...0003); title = 'Tu reporte está siendo revisado'; body sin
-- mención de admin_notes/reviewed_by/motivo/descripción original.

-- ------------------------------------------------------------
-- P-NOTIF-2: under_review -> dismissed dispara el mensaje de cierre.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'dismissed', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000010';
reset role;

select user_id, type, title
from public.notifications
where type = 'report_status_update' and (data->>'reportId') = 'f2000000-0000-4000-8000-000000000010'
order by created_at desc limit 1;
-- title = 'Tu reporte ha sido cerrado'.

-- ------------------------------------------------------------
-- P-NOTIF-3: pending -> resolved (vía otro reporte nuevo) dispara el
-- mensaje de "fue revisado".
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports
  (id, reporter_id, target_type, reported_user_id, reason, description, status)
values
  ('f2000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000001',
   'user', 'f0000000-0000-4000-8000-000000000003', 'no_show', 'Reporte para pruebas de notificación resolved', 'pending');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'under_review', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000011';
update public.reports set status = 'resolved', updated_at = now()
  where id = 'f2000000-0000-4000-8000-000000000011';
reset role;

select user_id, type, title from public.notifications
where type = 'report_status_update' and (data->>'reportId') = 'f2000000-0000-4000-8000-000000000011'
order by created_at desc limit 1;
-- title = 'Tu reporte fue revisado'.

-- ------------------------------------------------------------
-- N-NOTIF-1: action_type='note_added' NO debe generar ninguna
-- notificación al usuario reportado (interno, sin consecuencia).
-- ------------------------------------------------------------
select count(*) from public.notifications
where type = 'moderation_action' and user_id = 'f0000000-0000-4000-8000-000000000003';
-- Cuenta ANTES de warning/suspension/block (debe ser 0 — el único
-- moderation_action insertado hasta ahora fue P-MOD-1, 'note_added').

-- ------------------------------------------------------------
-- P-NOTIF-4/5/6: warning_issued / temporary_suspension / permanent_block
-- SÍ notifican al usuario reportado, con texto genérico (sin report_id,
-- sin motivo, sin identidad del reportante).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000005',
        'f0000000-0000-4000-8000-000000000003', 'warning_issued');
reset role;

select user_id, type, title, body, data, priority from public.notifications
where type = 'moderation_action' and user_id = 'f0000000-0000-4000-8000-000000000003'
order by created_at desc limit 1;
-- data debe ser '{}'::jsonb (sin reportId ni ningún identificador
-- rastreable), body genérico, priority = 'high'.

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000005',
        'f0000000-0000-4000-8000-000000000003', 'temporary_suspension');
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000005',
        'f0000000-0000-4000-8000-000000000003', 'permanent_block');
reset role;

select count(*) from public.notifications
where type = 'moderation_action' and user_id = 'f0000000-0000-4000-8000-000000000003';
-- Debe ser 3 ahora (warning + suspension + block), NUNCA 4 — note_added
-- (P-MOD-1) confirmado que no generó ninguna.

-- ------------------------------------------------------------
-- N-NOTIF-2: action_type='status_changed' (el que updateReportStatus()
-- inserta automáticamente en cada cambio de estado) NO debe generar una
-- notificación SEGUNDA vía notify_moderation_action — la notificación de
-- cambio de estado ya la generó notify_report_status_changed() sobre la
-- tabla `reports`, no sobre `moderation_actions`.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
insert into public.moderation_actions (report_id, admin_id, target_user_id, action_type, metadata)
values ('f2000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000005',
        'f0000000-0000-4000-8000-000000000003', 'status_changed', '{"from":"under_review","to":"dismissed"}');
reset role;

select count(*) from public.notifications
where type = 'moderation_action' and user_id = 'f0000000-0000-4000-8000-000000000003';
-- Debe seguir en 3 (no 4) — status_changed no está en la lista de
-- action_type que notify_moderation_action() escucha.


-- ============================================================
-- PARTE D — F6-02: reports_no_duplicate_active_job (0025), 7 escenarios
-- ============================================================

-- ------------------------------------------------------------
-- D1: primer reporte de oferta (reporter f0...01, job f1...01,
-- reason='non_compliance', pending) — debe permitirse.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
        'job', 'f1000000-0000-4000-8000-000000000001', 'non_compliance', 'Primer reporte de oferta Fase 8', 'pending');
reset role;

-- ------------------------------------------------------------
-- D2: duplicado EXACTO (mismo reporter, mismo job, mismo reason,
-- pending) — debe fallar con unique_violation (23505).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
        'job', 'f1000000-0000-4000-8000-000000000001', 'non_compliance', 'Intento de duplicado exacto', 'pending');
reset role;
-- Se espera: ERROR  23505  duplicate key value violates unique constraint "reports_no_duplicate_active_job"

-- ------------------------------------------------------------
-- D3: mismo reporter, mismo job, REASON DISTINTO — debe permitirse (son
-- señales distintas, no la misma denuncia repetida).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
        'job', 'f1000000-0000-4000-8000-000000000001', 'suspicious_terms', 'Motivo distinto, mismo job', 'pending');
reset role;

-- ------------------------------------------------------------
-- D4: REPORTER DISTINTO, mismo job, mismo reason — debe permitirse (el
-- índice agrupa por reporter_id, nunca cruza usuarios).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002',
        'job', 'f1000000-0000-4000-8000-000000000001', 'non_compliance', 'Otro reportante, mismo job y motivo', 'pending');
reset role;

-- ------------------------------------------------------------
-- D5: el primer reporte (f5...0001) pasa a 'resolved' — el reportante
-- original SÍ puede volver a reportar el mismo job por el mismo motivo
-- (nuevo incidente, el índice parcial ya no lo cubre).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'under_review', updated_at = now()
  where id = 'f5000000-0000-4000-8000-000000000001';
update public.reports set status = 'resolved', updated_at = now()
  where id = 'f5000000-0000-4000-8000-000000000001';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001',
        'job', 'f1000000-0000-4000-8000-000000000001', 'non_compliance', 'Nuevo incidente tras resolución', 'pending');
reset role;
-- Debe insertarse SIN error.

-- ------------------------------------------------------------
-- D6: mismo patrón pero con un reporte previo en 'dismissed' — también
-- debe permitirse.
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000005';
update public.reports set status = 'under_review', updated_at = now()
  where id = 'f5000000-0000-4000-8000-000000000005';
update public.reports set status = 'dismissed', updated_at = now()
  where id = 'f5000000-0000-4000-8000-000000000005';
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_job_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001',
        'job', 'f1000000-0000-4000-8000-000000000001', 'non_compliance', 'Nuevo incidente tras dismissed', 'pending');
reset role;
-- Debe insertarse SIN error.

-- ------------------------------------------------------------
-- D7: regresión — reports_no_duplicate_active (0019, target 'user')
-- sigue funcionando exactamente igual después de 0025 (0025 es aditivo,
-- no reemplaza ni interfiere con el índice de 0019).
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000002',
        'user', 'f0000000-0000-4000-8000-000000000003', 'harassment', 'Reporte de usuario para regresión D7', 'pending');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('f5000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000002',
        'user', 'f0000000-0000-4000-8000-000000000003', 'harassment', 'Duplicado de usuario, debe fallar', 'pending');
reset role;
-- Se espera: ERROR 23505 sobre "reports_no_duplicate_active" (no "_job").


-- ============================================================
-- PARTE C — F6-01: enforce_report_evidence_limit() (0024)
-- SOLO comportamiento SECUENCIAL de una conexión: conteo, excepción,
-- rollback. La garantía de CONCURRENCIA real (dos conexiones
-- simultáneas) requiere phase8_concurrency_f6_01.sh — no se puede
-- demostrar con instrucciones secuenciales de un único cliente psql,
-- sin importar el orden en que se escriban.
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
values ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001',
        'user', 'f0000000-0000-4000-8000-000000000003', 'other', 'Reporte para límite de evidencia', 'pending');
reset role;

-- P-EVLIM-1: los primeros 5 archivos se insertan sin problema.
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.report_evidence (report_id, storage_path, file_name, content_type, uploaded_by) values
  ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/1.jpg', '1.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/2.jpg', '2.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/3.jpg', '3.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/4.jpg', '4.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/5.jpg', '5.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001');
reset role;

select count(*) from public.report_evidence where report_id = 'f2000000-0000-4000-8000-000000000020';
-- Debe ser 5.

-- N-EVLIM-1: el 6º archivo debe rechazarse con el mensaje/errcode
-- exactos que report-evidence.ts busca (report_evidence_limit_exceeded).
set role authenticated;
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
insert into public.report_evidence (report_id, storage_path, file_name, content_type, uploaded_by)
values ('f2000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000020/6.jpg', '6.jpg', 'image/jpeg', 'f0000000-0000-4000-8000-000000000001');
reset role;
-- Se espera: ERROR P0001  report_evidence_limit_exceeded: máximo 5 archivos de evidencia por reporte

-- N-EVLIM-2: confirma que el rechazo no dejó una fila corrupta/parcial —
-- el conteo sigue siendo exactamente 5, ninguna fila del 6º intento quedó.
select count(*) from public.report_evidence where report_id = 'f2000000-0000-4000-8000-000000000020';
-- Debe seguir siendo 5.

select id from public.report_evidence
where report_id = 'f2000000-0000-4000-8000-000000000020' and file_name = '6.jpg';
-- Debe ser 0 filas — el INSERT rechazado no dejó rastro.

-- ============================================================
-- FIN DE LA SUITE SECUENCIAL.
--
-- Pendiente (fuera del alcance de un único cliente psql):
--   - F6-01 bajo concurrencia real -> phase8_concurrency_f6_01.sh
--   - Storage/Auth (Parte F)        -> phase8_storage_rls.md
-- ============================================================
