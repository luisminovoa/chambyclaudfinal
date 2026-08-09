-- ============================================================
-- CHAMBY — Anti-duplicado para reportes de oferta (Fase 6, Parte C)
--
-- Problema (hallazgo F6-02, auditoría Fase 5/6): reports_no_duplicate_active
-- (0019) es un índice único parcial sobre (reporter_id, reported_user_id,
-- reason) filtrado por `reported_user_id is not null` — solo cubre
-- target_type='user'. Los reportes target_type='job' (reported_job_id no
-- nulo, reported_user_id siempre null por el CHECK reports_target_matches_type
-- de 0019) no tenían ninguna protección equivalente: un mismo reportante
-- podía crear reportes duplicados ilimitados contra la misma oferta.
--
-- Intención del diseño original (§12 de docs/user-reporting-moderation-
-- design.md, ya aplicada al caso 'user' en 0019): bloquear solo el
-- duplicado EXACTO mientras sigue activo — mismo reportante + mismo
-- objetivo + mismo motivo + estado en (pending, under_review). Permitir:
--   - reportar de nuevo tras resolución/descarte (nuevo incidente);
--   - reportar la misma oferta por un motivo DISTINTO mientras el primero
--     sigue activo (son señales distintas, no el mismo reporte repetido);
--   - que reportantes DISTINTOS reporten la misma oferta sin límite entre
--     ellos (el índice solo agrupa por reporter_id, nunca cruza usuarios).
--
-- Este índice es el análogo exacto de reports_no_duplicate_active mismo
-- patrón, misma condición de estado, solo cambiando la columna objetivo de
-- reported_user_id a reported_job_id. No reemplaza ni modifica el índice de
-- 0019 — es aditivo.
--
-- Seguro para datos históricos: al ser un índice PARCIAL (solo indexa filas
-- con status in ('pending','under_review') and reported_job_id is not
-- null), cualquier reporte de oferta ya resuelto/descartado queda fuera del
-- índice y nunca puede violarlo — no hay backfill que pueda entrar en
-- conflicto. Comportamiento ante 23505: ya manejado por submitReport()
-- (src/lib/actions/reports.ts), generalizado en esta misma fase para
-- distinguir el mensaje amigable entre 'este usuario' y 'esta oferta'.
-- ============================================================

create unique index if not exists reports_no_duplicate_active_job
  on public.reports (reporter_id, reported_job_id, reason)
  where status in ('pending', 'under_review') and reported_job_id is not null;
