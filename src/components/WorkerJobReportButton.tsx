"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { reportJobFinished } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";

/**
 * Fase 8 (C4-G21): botón del trabajador para reportar un trabajo
 * "en_progreso" como terminado — primer paso del flujo bilateral, el
 * empleador confirma después (ver JobActions.tsx/EmployerJobRow.tsx).
 * Una vez reportado, no hay forma de deshacerlo desde la UI (no hay botón
 * de rechazo en esta primera versión, ver docs/FASE8-BILATERAL-COMPLETION.md).
 */
export function WorkerJobReportButton({
  jobId,
  workerReportedFinishedAt,
}: {
  jobId: string;
  workerReportedFinishedAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (workerReportedFinishedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-muted">
        <Clock className="h-3.5 w-3.5" />
        Pendiente de confirmación del empleador
      </span>
    );
  }

  function handleReport() {
    startTransition(async () => {
      const result = await reportJobFinished(jobId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Marcaste el trabajo como terminado", "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleReport}
      className="btn-primary !rounded-xl !px-3 !py-1.5 text-xs"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Marcar trabajo terminado
    </button>
  );
}
