-- ============================================================
-- CHAMBY — Límite de 5 evidencias por reporte: garantía atómica (Fase 6, Parte B)
--
-- Problema (hallazgo F6-01, auditoría Fase 5/6): createReportEvidenceUploadUrl()
-- y saveReportEvidence() (report-evidence.ts) verifican `count < 5` antes de
-- insertar, pero un `select count(*)` seguido de un `insert` en transacciones
-- separadas NO es atómico — dos subidas concurrentes del mismo reportante
-- contra el mismo reporte podrían ambas leer count=4 y ambas insertar,
-- terminando en 6 filas. Un CHECK constraint normal no puede resolver esto:
-- un CHECK solo ve la fila que se está insertando, no puede agregar/contar
-- otras filas de la misma tabla.
--
-- Solución: un trigger BEFORE INSERT que serializa por report_id usando un
-- advisory lock transaccional (pg_advisory_xact_lock) antes de contar. Dos
-- INSERT concurrentes contra el MISMO report_id ya no pueden evaluar el
-- conteo en paralelo — el segundo espera a que el primero libere el lock
-- (al hacer commit o rollback, automático al final de su transacción) antes
-- de correr su propio `count(*)`, así que ese conteo ya refleja cualquier
-- fila que el primero haya insertado. Inserts contra report_id DISTINTOS no
-- se bloquean entre sí (el lock está namespaced por hashtext(report_id)).
--
-- security definer: el conteo debe ver TODAS las filas de ese report_id,
-- no solo las que la policy SELECT actual (uploaded_by = auth.uid() or
-- admin) dejaría ver al reportante que ejecuta el INSERT — en la práctica
-- coincide siempre (solo el propio reportante puede insertar evidencia en
-- su reporte, por report_evidence_insert_own de 0019), pero la garantía
-- real del invariante "máximo 5 por reporte" no debe depender de RLS.
--
-- Complementa, no reemplaza: las validaciones de conteo en
-- report-evidence.ts (createReportEvidenceUploadUrl/saveReportEvidence)
-- se mantienen sin cambios — siguen siendo el camino de fallo rápido (evita
-- generar una signed URL o subir un archivo al bucket cuando ya se sabe que
-- el límite está alcanzado). Este trigger es la garantía real; el resto es
-- UX. saveReportEvidence() se actualiza para traducir el mensaje de este
-- trigger a uno amigable en vez de un error genérico (ver report-evidence.ts).
-- ============================================================

create or replace function public.enforce_report_evidence_limit()
returns trigger as $$
begin
  -- Namespace propio (947261) para no colisionar con ningún otro uso futuro
  -- de advisory locks en el proyecto — hoy no existe ninguno (0001-0023).
  perform pg_advisory_xact_lock(947261, hashtext(new.report_id::text));

  if (select count(*) from public.report_evidence where report_id = new.report_id) >= 5 then
    raise exception 'report_evidence_limit_exceeded: máximo 5 archivos de evidencia por reporte'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_report_evidence_limit on public.report_evidence;
create trigger trg_report_evidence_limit
  before insert on public.report_evidence
  for each row execute function public.enforce_report_evidence_limit();
