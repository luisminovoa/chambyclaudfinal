"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ReportModal } from "@/components/reports/ReportModal";
import type { ReportTargetType, UserRole } from "@/lib/types";

interface ReportButtonProps {
  targetType: ReportTargetType;
  reportedUserId?: string;
  reportedJobId?: string;
  relatedJobId?: string;
  reportedUserRole?: UserRole;
  targetLabel?: string;
  /** "icon": botón circular compacto (fila de iconos de JobCardActions, esquina de un header, chat). "text": texto pequeño con ícono, para colocarse suelto sin competir con las acciones principales. */
  variant?: "icon" | "text";
  className?: string;
}

/**
 * Trigger de "Reportar" — cada punto de montaje (perfil, chat, oferta)
 * tiene su propio layout de acciones, así que el botón en sí es
 * deliberadamente pequeño y contextual (mismo criterio que el resto de
 * los botones de esta app: no hay un <Button> genérico, cada acción se
 * estiliza donde vive). El diálogo (ReportModal) sí es 100% compartido.
 */
export function ReportButton({
  targetType,
  reportedUserId,
  reportedJobId,
  relatedJobId,
  reportedUserRole,
  targetLabel,
  variant = "text",
  className,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Reportar"
          className={
            className ??
            "flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-ink-muted transition-colors hover:border-danger-300 hover:text-danger-600"
          }
        >
          <Flag className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ??
            "inline-flex items-center gap-1 text-xs font-medium text-ink-muted transition-colors hover:text-danger-600"
          }
        >
          <Flag className="h-3.5 w-3.5" />
          Reportar
        </button>
      )}

      <ReportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        reportedUserId={reportedUserId}
        reportedJobId={reportedJobId}
        relatedJobId={relatedJobId}
        reportedUserRole={reportedUserRole}
        targetLabel={targetLabel}
      />
    </>
  );
}
