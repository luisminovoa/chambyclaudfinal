"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { completeJob, cancelJob } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";

interface JobActionsProps {
  jobId: string;
  jobStatus: string;
}

export function JobActions({ jobId, jobStatus }: JobActionsProps) {
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleComplete() {
    setConfirmingComplete(false);
    startTransition(async () => {
      const result = await completeJob(jobId);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Trabajo marcado como completado", "success");
      }
    });
  }

  function handleCancel() {
    setConfirmingCancel(false);
    startTransition(async () => {
      const result = await cancelJob(jobId);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Trabajo cancelado", "info");
      }
    });
  }

  if (jobStatus !== "en_progreso" && jobStatus !== "abierto") return null;

  return (
    <div className="mt-6 space-y-3">
      {/* Completar trabajo */}
      {jobStatus === "en_progreso" && (
        <>
          {confirmingComplete ? (
            <div className="flex items-start gap-3 rounded-2xl border border-success-100 bg-success-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-success-700">
                  ¿Confirmas que el trabajo fue completado? Esto habilitará la calificación mutua.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={isPending}
                    onClick={handleComplete}
                    className="btn-primary !min-h-0 !rounded-xl !px-4 !py-2 text-sm"
                  >
                    Sí, completar
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => setConfirmingComplete(false)}
                    className="btn-ghost !min-h-0 !rounded-xl !px-4 !py-2 text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              disabled={isPending}
              onClick={() => setConfirmingComplete(true)}
              className="btn-primary w-full"
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar como completado
            </button>
          )}
        </>
      )}

      {/* Cancelar trabajo */}
      {jobStatus === "abierto" && (
        <>
          {confirmingCancel ? (
            <div className="flex items-start gap-3 rounded-2xl border border-danger-100 bg-danger-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-danger-700">
                  ¿Seguro que quieres cancelar este trabajo? Esta acción no se puede deshacer.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={isPending}
                    onClick={handleCancel}
                    className="btn-danger !min-h-0 !rounded-xl !px-4 !py-2 text-sm"
                  >
                    Sí, cancelar
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => setConfirmingCancel(false)}
                    className="btn-ghost !min-h-0 !rounded-xl !px-4 !py-2 text-sm"
                  >
                    Volver
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              disabled={isPending}
              onClick={() => setConfirmingCancel(true)}
              className="btn-ghost w-full !text-danger-600 hover:!bg-danger-50"
            >
              <XCircle className="h-4 w-4" />
              Cancelar trabajo
            </button>
          )}
        </>
      )}
    </div>
  );
}
