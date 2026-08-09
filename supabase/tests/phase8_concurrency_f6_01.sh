#!/usr/bin/env bash
# ============================================================
# CHAMBY — Fase 8, Parte C: harness de CONCURRENCIA REAL para F6-01
# ============================================================
# reports_security_phase8.sql (Parte C) solo puede probar el conteo/
# excepción/rollback de forma SECUENCIAL, con una sola conexión — eso NO
# demuestra que pg_advisory_xact_lock() (0024) sirva bajo una carrera
# real. Este script abre DOS conexiones psql simultáneas contra el MISMO
# report_id, cada una intentando insertar el archivo de evidencia #5
# (partiendo de un reporte con exactamente 4 filas ya existentes). Sin
# el lock, ambas transacciones podrían leer count()=4 al mismo tiempo y
# ambas insertar, terminando en 6 filas (el bug original, F6-01). Con el
# lock funcionando, una debe ganar el advisory lock, insertar (llegando
# a 5), y la otra debe esperar, contar 5 y RECHAZAR.
#
# NO EJECUTADO EN LA SESIÓN QUE ESCRIBIÓ ESTE ARCHIVO — este entorno no
# tiene acceso a ningún Postgres real (ver informe de Fase 7). Este
# script está preparado y listo para correr en cuanto exista uno.
#
# ------------------------------------------------------------
# REQUISITOS Y GUARDAS DE SEGURIDAD
# ------------------------------------------------------------
# 1. PHASE8_DATABASE_URL debe apuntar a un Postgres DESECHABLE de TEST,
#    nunca a un proyecto Supabase de producción NI de staging compartido
#    sin que un humano lo haya confirmado explícitamente (Parte L).
# 2. PHASE8_CONFIRM_NOT_PROD=yes es obligatorio — guarda deliberada
#    adicional para que este script nunca corra "por accidente" contra
#    la variable de entorno equivocada.
# 3. Las migraciones 0001-0025 ya deben estar aplicadas en esa base
#    (este script NO las aplica — evita ejecutar DDL destructivo sin que
#    un humano lo haya decidido explícitamente).
# 4. Los datos de prueba usan el prefijo 'f6' — se limpian al final del
#    script (DELETE del reporte de prueba, cascada a report_evidence).
#    Si el script se interrumpe a mitad de camino, el reporte 'f6...'
#    puede quedar huérfano — seguro de dejar (es un dato claramente
#    identificable de prueba), pero se recomienda re-correr la limpieza
#    manual indicada al final si eso ocurre.
#
# Uso:
#   PHASE8_DATABASE_URL="postgres://user:pass@host:5432/dbname" \
#   PHASE8_CONFIRM_NOT_PROD=yes \
#   ./supabase/tests/phase8_concurrency_f6_01.sh
# ============================================================

set -euo pipefail

if [[ "${PHASE8_CONFIRM_NOT_PROD:-}" != "yes" ]]; then
  echo "ERROR: define PHASE8_CONFIRM_NOT_PROD=yes para confirmar explícitamente" >&2
  echo "       que PHASE8_DATABASE_URL NO apunta a producción. Abortando." >&2
  exit 1
fi

if [[ -z "${PHASE8_DATABASE_URL:-}" ]]; then
  echo "ERROR: define PHASE8_DATABASE_URL con la cadena de conexión del" >&2
  echo "       Postgres de TEST/STAGING desechable. Abortando." >&2
  exit 1
fi

DB="$PHASE8_DATABASE_URL"
REPORTER_ID="f6000000-0000-4000-8000-000000000001"
REPORT_ID="f6000000-0000-4000-8000-000000000099"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "== Fase 8 / Parte C — harness de concurrencia real para F6-01 =="
echo "Conectando a: $(echo "$DB" | sed -E 's#(://[^:]+:)[^@]+(@)#\1***\2#')"

echo "-- Verificando que el reportante de prueba exista (si no, créalo tú" \
     "   antes de correr este script — este harness no crea auth.users," \
     "   solo reutiliza un reportante ya existente en tu entorno de test)."
EXISTING_PROFILE=$(psql "$DB" -tA -c "select 1 from public.profiles where id = '$REPORTER_ID';" || true)
if [[ -z "$EXISTING_PROFILE" ]]; then
  echo "ERROR: no existe public.profiles.id = '$REPORTER_ID' en esta base." >&2
  echo "       Crea un usuario de prueba con ese id (vía auth.users, para" >&2
  echo "       que handle_new_user() cree el profile) antes de reintentar." >&2
  exit 1
fi

echo "-- Preparando reporte de prueba con exactamente 4 evidencias existentes..."
psql "$DB" -v ON_ERROR_STOP=1 <<SQL
delete from public.reports where id = '$REPORT_ID';
insert into public.reports (id, reporter_id, target_type, reported_user_id, reason, description, status)
select '$REPORT_ID', '$REPORTER_ID', 'user', p.id, 'other', 'Fase 8 — harness de concurrencia F6-01', 'pending'
from public.profiles p where p.id <> '$REPORTER_ID' limit 1;
insert into public.report_evidence (report_id, storage_path, file_name, content_type, uploaded_by) values
  ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/1.jpg', '1.jpg', 'image/jpeg', '$REPORTER_ID'),
  ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/2.jpg', '2.jpg', 'image/jpeg', '$REPORTER_ID'),
  ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/3.jpg', '3.jpg', 'image/jpeg', '$REPORTER_ID'),
  ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/4.jpg', '4.jpg', 'image/jpeg', '$REPORTER_ID');
SQL

echo "-- Lanzando DOS conexiones concurrentes intentando insertar la 5ª evidencia..."
# pg_sleep(1) dentro de cada transacción ensancha la ventana de solape
# deliberadamente — sin esto, el dispatch secuencial de bash podría
# terminar una transacción antes de que la otra siquiera empiece,
# ocultando la condición de carrera en vez de probarla.
cat > "$TMPDIR/session_a.sql" <<SQL
begin;
select pg_sleep(1);
insert into public.report_evidence (report_id, storage_path, file_name, content_type, uploaded_by)
values ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/5-session-a.jpg', '5-session-a.jpg', 'image/jpeg', '$REPORTER_ID');
commit;
SQL
cat > "$TMPDIR/session_b.sql" <<SQL
begin;
select pg_sleep(1);
insert into public.report_evidence (report_id, storage_path, file_name, content_type, uploaded_by)
values ('$REPORT_ID', '$REPORTER_ID/$REPORT_ID/6-session-b.jpg', '6-session-b.jpg', 'image/jpeg', '$REPORTER_ID');
commit;
SQL

psql "$DB" -f "$TMPDIR/session_a.sql" > "$TMPDIR/out_a.log" 2>&1 &
PID_A=$!
psql "$DB" -f "$TMPDIR/session_b.sql" > "$TMPDIR/out_b.log" 2>&1 &
PID_B=$!

RC_A=0; RC_B=0
wait "$PID_A" || RC_A=$?
wait "$PID_B" || RC_B=$?

echo ""
echo "== Resultado sesión A (exit code $RC_A) =="
cat "$TMPDIR/out_a.log"
echo ""
echo "== Resultado sesión B (exit code $RC_B) =="
cat "$TMPDIR/out_b.log"

FINAL_COUNT=$(psql "$DB" -tA -c "select count(*) from public.report_evidence where report_id = '$REPORT_ID';")
echo ""
echo "== Conteo final de report_evidence para $REPORT_ID: $FINAL_COUNT =="

echo ""
if [[ "$FINAL_COUNT" == "5" ]] && [[ "$RC_A" != "$RC_B" ]]; then
  echo "RESULTADO: PASA — el conteo final es exactamente 5 y exactamente"
  echo "una de las dos sesiones fue rechazada. El advisory lock serializó"
  echo "la carrera correctamente (F6-01 cerrado, confirmado bajo"
  echo "concurrencia real, no solo por lectura de SQL)."
elif [[ "$FINAL_COUNT" -gt "5" ]]; then
  echo "RESULTADO: FALLA CRÍTICA — el conteo final es $FINAL_COUNT (>5)."
  echo "El trigger NO serializó correctamente la carrera. F6-01 sigue"
  echo "abierto pese al SQL de 0024. Reportar como hallazgo CRÍTICO antes"
  echo "de continuar con cualquier otra validación."
else
  echo "RESULTADO: INCONCLUSO — revisa los logs de arriba manualmente."
  echo "(conteo final=$FINAL_COUNT, RC_A=$RC_A, RC_B=$RC_B) — no asumas"
  echo "que el resultado es 'PASA' sin que ambas condiciones se cumplan."
fi

echo ""
echo "-- Limpiando datos de prueba (DELETE cascada reports -> report_evidence)..."
psql "$DB" -v ON_ERROR_STOP=1 -c "delete from public.reports where id = '$REPORT_ID';"
echo "-- Limpieza completa."
