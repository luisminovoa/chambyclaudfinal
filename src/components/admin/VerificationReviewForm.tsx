"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { reviewVerificationDocument } from "@/lib/actions/admin";
import { REJECTION_REASONS } from "@/lib/document-verification";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import type { DocumentRejectionReason } from "@/lib/types";

type Mode = "idle" | "confirmApprove" | "reject";

export function VerificationReviewForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState<DocumentRejectionReason | null>(null);
  const [note, setNote] = useState("");

  function handleApprove() {
    startTransition(async () => {
      const result = await reviewVerificationDocument(documentId, "verified");
      if (result.error) {
        toast(result.error, "error");
        setMode("idle");
      } else {
        toast("Documento aprobado", "success");
        router.push("/admin/verifications");
      }
    });
  }

  function handleReject() {
    if (!reason) return;
    startTransition(async () => {
      const result = await reviewVerificationDocument(documentId, "rejected", {
        rejectionReason: reason,
        rejectionNote: note,
      });
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Documento rechazado", "info");
        router.push("/admin/verifications");
      }
    });
  }

  if (mode === "reject") {
    return (
      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-bold text-ink">Motivo de rechazo</h2>
        <div className="space-y-2" role="radiogroup" aria-label="Motivo de rechazo">
          {REJECTION_REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-colors",
                reason === r.value
                  ? "border-danger-400 bg-danger-50 text-danger-700"
                  : "border-slate-200 text-ink-muted hover:border-slate-300"
              )}
            >
              <input
                type="radio"
                name="rejectionReason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="sr-only"
              />
              {r.label}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="rejection-note" className="label">
            Observación adicional <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id="rejection-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input min-h-[90px] resize-y"
            placeholder="Detalles para el trabajador..."
          />
        </div>

        {!reason && (
          <p className="flex items-center gap-1.5 text-xs text-warning-600">
            <AlertCircle className="h-3.5 w-3.5" />
            Selecciona un motivo para poder rechazar.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={!reason || isPending}
            className="btn-danger flex-1 justify-center"
          >
            Confirmar rechazo
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            disabled={isPending}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirmApprove") {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold text-ink">
          ¿Confirmas que este documento es válido y debe aprobarse? Esta acción no se puede
          deshacer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="btn-primary flex-1 justify-center"
          >
            Sí, aprobar
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            disabled={isPending}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setMode("confirmApprove")}
        disabled={isPending}
        className="btn-primary flex-1 justify-center"
      >
        <CheckCircle2 className="h-4 w-4" />
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        disabled={isPending}
        className="btn-danger flex-1 justify-center"
      >
        <XCircle className="h-4 w-4" />
        Rechazar
      </button>
    </div>
  );
}
