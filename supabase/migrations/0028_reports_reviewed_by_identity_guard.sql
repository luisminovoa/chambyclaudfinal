-- ============================================================
-- CHAMBY — Fase 11: reports.reviewed_by atado a auth.uid()
--
-- Hallazgo (auditoría Fase 11, mismo patrón que N-STATE-1/0026 y la
-- coherencia de moderation_actions/0027): updateReportStatus()
-- (src/lib/actions/admin-reports.ts) SIEMPRE escribe
-- `reviewed_by: adminId`, donde adminId proviene de assertAdmin()
-- (auth.uid() del admin autenticado) — nunca de un valor enviado por
-- el cliente. Pero reports_update_admin (0019) solo exige
-- `current_user_role() = 'admin'` en su WITH CHECK, sin relacionar
-- `reviewed_by` con `auth.uid()` — a diferencia de
-- moderation_actions_insert_admin (0020: "admin_id = auth.uid()"), que
-- SÍ tiene esta protección para su columna de identidad equivalente.
--
-- Un admin con JWT válido, llamando a PostgREST directamente (sin pasar
-- por la Server Action), podría hacer
-- `PATCH /rest/v1/reports?id=eq.<id>` con
-- `{"status": "under_review", "reviewed_by": "<uuid-de-otro-admin>"}` y
-- la base de datos lo aceptaría — atribuyendo una revisión a un admin
-- que nunca la hizo. CASO 3 (bypass real de una regla de identidad
-- implícita en el resto del esquema — ver 0020:73), severidad BAJA:
-- `reviewed_by` es un campo puramente interno de auditoría, nunca
-- visible al reportante (excluido de reporter_reports_view, 0019/0021)
-- ni al usuario reportado, y no dispara ningún efecto secundario
-- (notify_report_status_changed, 0023, no lo menciona). El impacto se
-- limita a la fiabilidad del panel admin ("¿qué admin revisó esto?").
--
-- A diferencia de moderation_actions.target_user_id (0027, que
-- requería un JOIN contra `reports` para validar coherencia, imposible
-- en un CHECK/WITH CHECK plano) y de la máquina de estados (0026, que
-- requería leer OLD.status, inaccesible en WITH CHECK), esta regla
-- compara una columna de la MISMA fila nueva contra auth.uid() — el
-- caso de uso exacto para el que WITH CHECK de una policy RLS existe.
-- No se necesita trigger ni función nueva: se re-declara la policy
-- reports_update_admin (mismo patrón de "corrige hacia adelante, no
-- edites la migración original" ya usado en 0021 para
-- reporter_reports_view y en 0022 para report_evidence).
--
-- reviewed_by = null se sigue permitiendo explícitamente en el WITH
-- CHECK: no hay ningún caso real en la app que lo necesite hoy (todo
-- UPDATE en reports —confirmado por grep, único call site en
-- admin-reports.ts:287— siempre setea reviewed_by al admin actual),
-- pero rechazar NULL sería inventar una restricción nueva no pedida
-- por ningún hallazgo real, y NULL nunca es el vector de ataque (el
-- vector es un UUID arbitrario DISTINTO de auth.uid()).
--
-- Compatibilidad con datos existentes: WITH CHECK solo se evalúa en
-- INSERT/UPDATE futuros contra la fila resultante — no revalida filas
-- ya almacenadas. Sin riesgo para datos actuales.
-- ============================================================

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  using (public.current_user_role() = 'admin')
  with check (
    public.current_user_role() = 'admin'
    and (reviewed_by is null or reviewed_by = auth.uid())
  );
