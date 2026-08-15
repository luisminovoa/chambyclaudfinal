-- ============================================================
-- CHAMBY — reporter_reports_view: agrega `description` (Fase 2)
--
-- 0019_user_reports_moderation.sql (Fase 1) definió
-- reporter_reports_view excluyendo admin_notes/reviewed_by/reviewed_at
-- — correcto, esas son columnas administrativas. Pero por descuido
-- también excluyó `description`, que es el propio texto que el
-- reportante escribió al crear su reporte: no hay ninguna razón de
-- privacidad para ocultársela a su autor. La sección "Mis reportes"
-- (Fase 2, src/app/dashboard/reports/page.tsx) la necesita para
-- mostrar "descripción propia" tal como pide el diseño.
--
-- `create or replace view` es seguro de reaplicar — no se edita
-- 0019 (ya aprobada/commiteada en Fase 1), se corrige hacia adelante.
-- ============================================================

create or replace view public.reporter_reports_view
  with (security_invoker = true) as
  select id, target_type, reported_user_id, reported_job_id, related_job_id,
         reason, description, status, created_at, updated_at
  from public.reports
  where reporter_id = auth.uid();

grant select on public.reporter_reports_view to authenticated;
