-- ============================================================
-- CHAMBY — report_evidence: policy DELETE faltante (Fase 4, Parte C)
--
-- 0019_user_reports_moderation.sql (Fase 1) definió INSERT/SELECT para
-- report_evidence pero ninguna policy DELETE — sin ella, RLS deniega
-- todo DELETE vía el cliente de sesión por defecto (deny-all), así que
-- deleteReportEvidence() no podía funcionar todavía. Mismo patrón
-- exacto que profile_photos/verification_documents
-- (0010_professional_profile.sql: "photos_delete_own"/"docs_delete_own",
-- ambas `for delete using (auth.uid() = profile_id)`) — aquí la
-- condición de dueño se combina con el estado del reporte: solo
-- mientras sigue 'pending' (una vez que un admin lo toma, el material
-- bajo revisión no debe poder alterarse — mismo criterio que ya
-- justifica report_evidence_insert_own en 0019).
-- ============================================================

drop policy if exists "report_evidence_delete_own_pending" on public.report_evidence;
create policy "report_evidence_delete_own_pending"
  on public.report_evidence for delete
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.reports
      where id = report_id and reporter_id = auth.uid() and status = 'pending'
    )
  );

-- ------------------------------------------------------------
-- Columna faltante: file_size. 0019 no la incluyó (nadie subía
-- evidencia todavía) pero el panel admin (Fase 4, Parte F) necesita
-- mostrar el tamaño de cada archivo, y ya se valida en servidor al
-- subir (createReportEvidenceUploadUrl, report-evidence.ts) — solo
-- faltaba persistirlo. Nullable: no hay filas existentes que migrar
-- (la subida real recién se implementa en esta fase), pero se deja
-- sin NOT NULL por si en el futuro se inserta una fila por otra vía.
-- ------------------------------------------------------------
alter table public.report_evidence
  add column if not exists file_size bigint;
