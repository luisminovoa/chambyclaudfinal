"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Flag, X, Send, CheckCircle } from "lucide-react";
import { submitReport } from "@/lib/actions/reports";
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
 * (targetLabel es opcional y solo repite lo que ya era visible). Fase
 * 2J: sin selector de archivos/upload/preview — la evidencia queda
 * para una fase posterior, la infraestructura (tabla/bucket) ya existe
 * pero no se usa desde esta UI todavía.
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);

  const reasonOptions = getReportReasonOptions(targetType, reportedUserRole);
  const title = REPORT_TARGET_TYPE_LABELS[targetType];

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => selectRef.current?.focus(), 50);
    } else {
      setReason("");
      setDescription("");
      setSuccess(false);
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
      if (result.error) {
        setError(result.error);
      } else {
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
              placeholder="Describe brevemente lo que ocurrió."
              className="input w-full resize-none text-sm"
            />
            <p className="mt-1 text-right text-[10px] text-ink-muted">{description.length}/2000</p>

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
                disabled={!reason || !description.trim() || isPending}
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
