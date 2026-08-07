"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Users, Trash2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { updateJobStatus, deleteJob } from "@/lib/actions/jobs";
import { jobStatusLabel, formatCurrency, payTypeLabel } from "@/lib/utils";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";
import type { Job } from "@/lib/types";

export function EmployerJobRow({ job, applicantsCount }: { job: Job; applicantsCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateJobStatus(job.id, status);
      toast(status === "completado" ? "Trabajo marcado como completado" : "Trabajo cancelado", "info");
      router.refresh();
    });
  }

  function handleDelete() {
    setConfirmingDelete(false);
    startTransition(async () => {
      await deleteJob(job.id);
      toast("Publicación eliminada", "info");
      router.refresh();
    });
  }

  return (
    <div className="border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/jobs/${job.id}`}
            className="text-sm font-bold text-ink transition-colors duration-200 hover:text-primary-600"
          >
            {job.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            {job.city} · {formatCurrency(job.pay_amount)} {payTypeLabel(job.pay_type)}
            <span className="inline-flex items-center gap-1 font-semibold text-primary-600">
              <Users className="h-3 w-3" />
              {applicantsCount} postulante{applicantsCount !== 1 && "s"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>

          {job.status === "en_progreso" && (
            <button
              disabled={isPending}
              onClick={() => handleStatusChange("completado")}
              className="btn-accent !rounded-xl !px-3 !py-1.5 text-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completar
            </button>
          )}
          {(job.status === "abierto" || job.status === "en_progreso") && (
            <button
              disabled={isPending}
              onClick={() => handleStatusChange("cancelado")}
              className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </button>
          )}
          <button
            disabled={isPending}
            onClick={() => setConfirmingDelete(true)}
            className="btn-danger !rounded-xl !px-3 !py-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        </div>
      </div>

      {/* Confirmación elegante en línea */}
      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-danger-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                ¿Eliminar esta publicación de forma permanente?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
                >
                  Conservar
                </button>
                <button
                  disabled={isPending}
                  onClick={handleDelete}
                  className="btn !rounded-xl bg-danger-500 !px-3 !py-1.5 text-xs text-white hover:bg-danger-600"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
