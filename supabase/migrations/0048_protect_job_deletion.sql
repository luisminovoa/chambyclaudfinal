-- ============================================================
-- CHAMBY — Protege jobs terminales (`completado`/`cancelado`) contra
-- borrado físico (hallazgo P1, auditoría post-V6: "Borrado en cascada de
-- jobs completados destruye ratings, applications, conversations/
-- messages y job_state_history").
--
-- CAUSA RAÍZ: `jobs_delete_owner_or_admin` (0001_init.sql, sin cambios
-- desde entonces) nunca restringió DELETE por `status` — a diferencia de
-- `jobs_update_owner_or_admin`, que sí quedó atada a
-- `status in ('abierto','en_progreso')` para el USING desde
-- 0008_harden_v2_v3_rls.sql (cierre de V3). `job_applications.job_id`,
-- `ratings.job_id`, `job_state_history.job_id` y `conversations.job_id`
-- (→ `messages.conversation_id`, transitiva) usan `on delete cascade`
-- desde 0001/0002 y siguen así — esta migración NO las toca.
--
-- El propio proyecto ya reconoció esta clase exacta de vulnerabilidad en
-- 0031_reports_survive_job_deletion.sql ("cualquier empleador dueño del
-- job puede borrarlo sin restricción... incluso si ese job tiene un
-- reporte activo en su contra... vector de evasión de moderación"), pero
-- la cerró únicamente para la cadena jobs→reports (cambiando esa FK a
-- `on delete set null`). Las cuatro cadenas restantes (ratings,
-- job_applications, job_state_history, conversations/messages) quedaron
-- sin corregir. `ratings` es especialmente sensible: la tabla no tiene
-- NINGUNA policy UPDATE/DELETE para ningún rol no-admin
-- (`ratings_select_all`/`ratings_insert_participant` son las únicas,
-- 0001/0007) — el borrado del job era la ÚNICA vía, directa o indirecta,
-- para destruir una calificación ya emitida.
--
-- FIX: se reemplaza hacia adelante `jobs_delete_owner_or_admin` para
-- exigir que el job esté en un estado NO terminal (`abierto` o
-- `en_progreso`) antes de permitir el DELETE — mismo patrón, mismos dos
-- estados, que ya usa el USING de `jobs_update_owner_or_admin` (0008).
-- Esto bloquea el DELETE en el punto de entrada exacto, antes de que
-- Postgres llegue siquiera a evaluar las cascadas: no hace falta tocar
-- ninguna FK.
--
-- ALCANCE DE LA DECISIÓN (confirmado explícitamente, no asumido): el
-- bypass de admin en esta policy TAMBIÉN se restringe. adminDeleteJob()
-- (src/lib/actions/admin.ts) no tiene ningún caso de uso documentado que
-- requiera borrar físicamente un job `completado`/`cancelado` — la
-- moderación admin ya cuenta con adminUpdateJobStatus() (cambio de
-- status libre, sin restricción, sin cambios en esta migración) para
-- cualquier necesidad de moderación sobre un job terminal. Un admin
-- conserva bypass total de DELETE sobre jobs `abierto`/`en_progreso`
-- (igual que antes), y sigue teniendo control total sobre el status de
-- CUALQUIER job vía `jobs_update_owner_or_admin`, que esta migración no
-- toca.
--
-- NO se modifica: 0001, 0002, 0031, 0045, 0046, 0047, ninguna policy ni
-- función de ratings/job_applications/conversations/messages/
-- job_state_history/reports, ninguna FK, `current_user_role()`,
-- `handle_application_accepted()`. No se borra ni transforma ningún dato
-- existente — es un cambio de policy puro, seguro de desplegar.
-- ============================================================

drop policy if exists "jobs_delete_owner_or_admin" on public.jobs;
create policy "jobs_delete_owner_or_admin"
  on public.jobs for delete
  using (
    (auth.uid() = employer_id or public.current_user_role() = 'admin')
    and status in ('abierto', 'en_progreso')
  );
