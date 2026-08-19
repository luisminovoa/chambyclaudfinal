-- ============================================================
-- CHAMBY — Corrección de reporter_reports_view tras incidente 0021
--
-- 0021 fue diseñada para agregar `description` a la vista, pero intentó
-- insertarla antes de `status`. PostgreSQL no permite que CREATE OR
-- REPLACE VIEW cambie el nombre, orden ni tipo de las columnas existentes,
-- por lo que esa definición falló con SQLSTATE 42P16.
--
-- 0021 ya figura como aplicada en el migration ledger de Production. Esta
-- migración corrige el estado hacia adelante sin modificar 0021 ni el
-- historial existente: conserva las nueve columnas de 0019 exactamente
-- en su orden original y agrega `description` como la última columna.
-- ============================================================

create or replace view public.reporter_reports_view
  with (security_invoker = true) as
  select
    id,
    target_type,
    reported_user_id,
    reported_job_id,
    related_job_id,
    reason,
    status,
    created_at,
    updated_at,
    description
  from public.reports
  where reporter_id = auth.uid();

grant select on public.reporter_reports_view to authenticated;
