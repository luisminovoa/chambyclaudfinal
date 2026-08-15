"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Flag, X, Send, CheckCircle, Paperclip, AlertTriangle, RotateCcw } from "lucide-react";
import { submitReport } from "@/lib/actions/reports";
import { createReportEvidenceUploadUrl, saveReportEvidence } from "@/lib/actions/report-evidence";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { getReportReasonOptions, REPORT_TARGET_TYPE_LABELS } from "@/lib/report-config";
import type { ReportReason, ReportTargetType, UserRole } from "@/lib/types";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  reportedUserId?: string;
  reportedJobId?: string;
  relatedJobId?: string;
  /** Rol del usuario reportado — determina qué motivos se ofrecen (ver report-config.ts). Ignorado si targetType='job'. */
  reportedUserRole?: UserRole;
  /** Nombre/título visible del objetivo, solo para confirmar "a quién/qué estás reportando" — nunca datos privados. */
  targetLabel?: string;
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface EvidenceFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

/**
 * Componente reutilizable de reporte — usado desde perfil público,
 * chat y ofertas de trabajo (ver docs/user-reporting-moderation-design.md
 * §14). Mismo patrón de modal hand-rolled que ReportErrorButton
 * (src/components/beta/ReportErrorButton.tsx): no existe un
 * Modal/Dialog genérico en src/components/ui/ para reutilizar.
 *
 * Deliberadamente NO incluye: quién revisará el reporte, notas
 * administrativas, identidad de quién decide, ni ningún dato del
 * usuario reportado más allá de lo que la propia página ya mostraba
 * (targetLabel es opcional y solo repite lo que ya era visible).
 *
 * Evidencia (Fase 4): los archivos se seleccionan y validan en el
 * cliente, pero NO se suben hasta enviar el reporte — la validación
 * real (tipo/extensión/tamaño/cantidad/propiedad/estado) vuelve a
 * ocurrir en el servidor (createReportEvidenceUploadUrl/
 * saveReportEvidence, report-evidence.ts), esta solo evita que el
 * usuario intente subir algo obviamente inválido. Si el reporte se
 * crea pero alguna evidencia falla, el reporte NO se revierte — se
 * ofrece reintentar solo los archivos fallidos mientras siga pending.
 */
export function ReportModal({
  isOpen,
  onClose,
  targetType,
  reportedUserId,
  reportedJobId,
  relatedJobId,
  reportedUserRole,
  targetLabel,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [evidenceFailed, setEvidenceFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reasonOptions = getReportReasonOptions(targetType, reportedUserRole);
  const title = REPORT_TARGET_TYPE_LABELS[targetType];
  const reportAlreadyCreated = reportId !== null;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => selectRef.current?.focus(), 50);
    } else {
      setReason("");
      setDescription("");
      setFiles([]);
      setFileError(null);
      setReportId(null);
      setSuccess(false);
      setEvidenceFailed(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    setFileError(null);

    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setFileError(`Ya adjuntaste el máximo de ${MAX_FILES} archivos.`);
      return;
    }

    const toAdd: EvidenceFile[] = [];
    for (const file of selected) {
      if (toAdd.length >= room) {
        setFileError(`Solo puedes adjuntar hasta ${MAX_FILES} archivos en total.`);
        break;
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setFileError(`"${file.name}" no es un formato permitido (JPG, PNG, WebP o PDF).`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`"${file.name}" supera el límite de 10 MB.`);
        continue;
      }
      toAdd.push({ id: crypto.randomUUID(), file, status: "pending" });
    }
    if (toAdd.length > 0) setFiles((prev) => [...prev, ...toAdd]);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id || f.status === "done" || f.status === "uploading"));
  }

  /** Sube los archivos que todavía no están en 'done' — usado tanto en el envío inicial como al reintentar. */
  async function uploadPendingFiles(rid: string): Promise<boolean> {
    let anyFailed = false;
    for (const ef of files) {
      if (ef.status === "done") continue;

      setFiles((prev) => prev.map((f) => (f.id === ef.id ? { ...f, status: "uploading", error: undefined } : f)));

      try {
        const urlRes = await createReportEvidenceUploadUrl(rid, ef.file.name, ef.file.type, ef.file.size);
        if ("error" in urlRes) throw new Error(urlRes.error);

        await uploadWithProgress(urlRes.uploadUrl, ef.file, ef.file.type, () => {});

        const saveRes = await saveReportEvidence({
          reportId: rid,
          storagePath: urlRes.storagePath,
          fileName: ef.file.name,
          contentType: ef.file.type,
          fileSize: ef.file.size,
        });
        if ("error" in saveRes) throw new Error(saveRes.error);

        setFiles((prev) => prev.map((f) => (f.id === ef.id ? { ...f, status: "done" } : f)));
      } catch (err) {
        anyFailed = true;
        const message = err instanceof Error ? err.message : "No se pudo subir el archivo.";
        setFiles((prev) => prev.map((f) => (f.id === ef.id ? { ...f, status: "error", error: message } : f)));
      }
    }
    return anyFailed;
  }

  function handleSubmit() {
    if (!reason || !description.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await submitReport({
        targetType,
        reportedUserId,
        reportedJobId,
        relatedJobId,
        reason: reason as ReportReason,
        description,
      });
      if (result.error || !result.reportId) {
        setError(result.error ?? "No se pudo enviar el reporte.");
        return;
      }

      setReportId(result.reportId);

      if (files.length === 0) {
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
        return;
      }

      const anyFailed = await uploadPendingFiles(result.reportId);
      if (anyFailed) {
        setEvidenceFailed(true);
      } else {
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      }
    });
  }

  function handleRetryEvidence() {
    if (!reportId) return;
    startTransition(async () => {
      const anyFailed = await uploadPendingFiles(reportId);
      if (!anyFailed) {
        setEvidenceFailed(false);
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-danger-600" />
            <h2 className="text-sm font-bold text-ink">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="mb-3 h-10 w-10 text-success-500" />
            <p className="font-semibold text-ink">Reporte enviado correctamente.</p>
            <p className="mt-1 text-sm text-ink-muted">
              Gracias por ayudarnos a mantener Chamby seguro.
            </p>
          </div>
        ) : evidenceFailed ? (
          <div className="py-2">
            <div className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El reporte fue enviado, pero una evidencia no pudo adjuntarse. Puedes reintentar
                mientras tu reporte siga pendiente.
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {files.map((ef) => (
                <li
                  key={ef.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {ef.file.name}{" "}
                    <span className="text-ink-muted">({formatFileSize(ef.file.size)})</span>
                  </span>
                  {ef.status === "done" && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success-500" />}
                  {ef.status === "error" && (
                    <span className="shrink-0 text-danger-600">{ef.error ?? "Error"}</span>
                  )}
                  {ef.status === "uploading" && <span className="shrink-0 text-ink-muted">Subiendo…</span>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleRetryEvidence}
                disabled={isPending}
                className="btn-primary flex-1 justify-center"
              >
                <RotateCcw className="h-4 w-4" />
                {isPending ? "Reintentando…" : "Reintentar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-ink-muted">Ayúdanos a mantener Chamby seguro.</p>

            {targetLabel && (
              <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-muted">
                Vas a reportar: <span className="font-semibold text-ink">{targetLabel}</span>
              </div>
            )}

            <label className="mb-1 block text-xs font-semibold text-ink">
              ¿Qué ocurrió? <span className="text-danger-500">*</span>
            </label>
            <select
              ref={selectRef}
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              disabled={reportAlreadyCreated}
              className="input w-full text-sm"
            >
              <option value="" disabled>
                Selecciona un motivo
              </option>
              {reasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label className="mb-1 mt-3 block text-xs font-semibold text-ink">
              Cuéntanos qué pasó <span className="text-danger-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              disabled={reportAlreadyCreated}
              placeholder="Describe brevemente lo que ocurrió."
              className="input w-full resize-none text-sm"
            />
            <p className="mt-1 text-right text-[10px] text-ink-muted">{description.length}/2000</p>

            {/* Evidencia */}
            <label className="mb-1 mt-3 block text-xs font-semibold text-ink">
              Evidencia <span className="font-normal text-ink-muted">(opcional, hasta {MAX_FILES} archivos)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_FILES || isPending}
              className="btn-secondary w-full justify-center text-xs"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Adjuntar archivo
            </button>
            <p className="mt-1 text-[10px] text-ink-muted">JPG, PNG, WebP o PDF · máx. 10 MB por archivo</p>

            {fileError && (
              <p className="mt-1.5 rounded-lg bg-danger-50 px-3 py-1.5 text-xs text-danger-700">{fileError}</p>
            )}

            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((ef) => (
                  <li
                    key={ef.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {ef.file.name}{" "}
                      <span className="text-ink-muted">({formatFileSize(ef.file.size)})</span>
                    </span>
                    {ef.status === "uploading" && <span className="shrink-0 text-ink-muted">Subiendo…</span>}
                    {ef.status === "done" && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success-500" />}
                    <button
                      type="button"
                      onClick={() => removeFile(ef.id)}
                      disabled={ef.status === "uploading" || ef.status === "done"}
                      aria-label={`Quitar ${ef.file.name}`}
                      className="shrink-0 text-ink-muted hover:text-danger-600 disabled:opacity-30"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || !description.trim() || isPending || reportAlreadyCreated}
                className="btn-primary flex-1 justify-center"
              >
                {isPending ? (
                  "Enviando…"
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar reporte
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
