"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReportStatus } from "@/lib/actions/admin-reports";
import { REPORT_STATUS_LABELS, REPORT_STATUS_TRANSITIONS } from "@/lib/report-config";
import { useToast } from "@/components/ui/Toaster";
import type { ReportStatus } from "@/lib/types";

interface Props {
  reportId: string;
  currentStatus: ReportStatus;
}

/**
 * Solo ofrece botones para las transiciones permitidas desde el
 * estado actual (REPORT_STATUS_TRANSITIONS, report-config.ts) — la
 * validación real, que nunca confía en lo que este componente envíe,
 * vive en updateReportStatus() (admin-reports.ts).
 */
export function AdminReportStatusForm({ reportId, currentStatus }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const nextStatuses = REPORT_STATUS_TRANSITIONS[currentStatus];

  if (nextStatuses.length === 0) {
    return (
      <div className="card p-5 text-center text-sm text-ink-muted">
        Este reporte está en un estado final ({REPORT_STATUS_LABELS[currentStatus]}).
      </div>
    );
  }

  function handleChange(newStatus: ReportStatus) {
    startTransition(async () => {
      const result = await updateReportStatus(reportId, newStatus, notes);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast(`Estado actualizado a "${REPORT_STATUS_LABELS[newStatus]}"`, "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-sm font-bold text-ink">Cambiar estado</h2>
      <div>
        <label htmlFor="admin-notes" className="label">
          Nota administrativa <span className="font-normal text-ink-muted">(opcional, solo admins)</span>
        </label>
        <textarea
          id="admin-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Notas internas sobre esta decisión..."
          className="input w-full resize-none text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => handleChange(status)}
            disabled={isPending}
            className={status === "dismissed" ? "btn-ghost" : "btn-primary"}
          >
            {isPending ? "Guardando…" : `Marcar como ${REPORT_STATUS_LABELS[status]}`}
          </button>
        ))}
      </div>
    </div>
  );
}
