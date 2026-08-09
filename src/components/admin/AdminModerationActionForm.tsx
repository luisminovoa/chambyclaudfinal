"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { recordModerationAction } from "@/lib/actions/admin-reports";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import type { ModerationActionType } from "@/lib/types";

const ACTION_OPTIONS: { value: ModerationActionType; label: string }[] = [
  { value: "note_added", label: "Nota" },
  { value: "warning_issued", label: "Advertencia" },
  { value: "temporary_suspension", label: "Suspensión" },
  { value: "permanent_block", label: "Bloqueo" },
];

/**
 * Registra una acción de moderación (moderation_actions) — solo el
 * registro de auditoría. No ejecuta ninguna suspensión/bloqueo real:
 * esta fase deliberadamente no conecta esto con toggleUserActive() ni
 * ningún otro mecanismo con efecto real (ver comentario en
 * recordModerationAction(), admin-reports.ts). Append-only: no existe
 * ningún formulario de edición/borrado en este panel.
 */
export function AdminModerationActionForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [actionType, setActionType] = useState<ModerationActionType>("note_added");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const isSanction = actionType === "temporary_suspension" || actionType === "permanent_block";

  function handleSubmit() {
    startTransition(async () => {
      const result = await recordModerationAction(reportId, actionType, reason);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Acción de moderación registrada", "success");
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-sm font-bold text-ink">Registrar acción de moderación</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de acción">
        {ACTION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "cursor-pointer rounded-xl border-2 px-3 py-2 text-center text-xs font-semibold transition-colors",
              actionType === opt.value
                ? "border-primary-400 bg-primary-50 text-primary-700"
                : "border-slate-200 text-ink-muted hover:border-slate-300"
            )}
          >
            <input
              type="radio"
              name="actionType"
              value={opt.value}
              checked={actionType === opt.value}
              onChange={() => setActionType(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>

      {isSanction && (
        <p className="flex items-start gap-1.5 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Esto solo queda registrado como historial — todavía no ejecuta ninguna suspensión o
          bloqueo real sobre la cuenta.
        </p>
      )}

      <div>
        <label htmlFor="action-reason" className="label">
          Motivo <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id="action-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Detalle de la acción..."
          className="input w-full resize-none text-sm"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="btn-secondary w-full justify-center"
      >
        {isPending ? "Registrando…" : "Registrar acción"}
      </button>
    </div>
  );
}
