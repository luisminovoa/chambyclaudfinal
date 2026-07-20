"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateJobStatus, deleteJob } from "@/lib/actions/jobs";
import { jobStatusColor, jobStatusLabel, formatCurrency, payTypeLabel } from "@/lib/utils";
import type { Job } from "@/lib/types";

export function EmployerJobRow({ job, applicantsCount }: { job: Job; applicantsCount: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateJobStatus(job.id, status);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("¿Seguro que quieres eliminar esta publicación?")) return;
    startTransition(async () => {
      await deleteJob(job.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link href={`/jobs/${job.id}`} className="font-medium text-slate-900 hover:underline">
          {job.title}
        </Link>
        <p className="text-xs text-slate-500">
          {job.city} · {formatCurrency(job.pay_amount)} {payTypeLabel(job.pay_type)} ·{" "}
          {applicantsCount} postulante{applicantsCount !== 1 && "s"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${jobStatusColor(job.status)}`}>{jobStatusLabel(job.status)}</span>

        {job.status === "en_progreso" && (
          <button disabled={isPending} onClick={() => handleStatusChange("completado")} className="btn-secondary !px-3 !py-1.5 text-xs">
            Marcar completado
          </button>
        )}
        {(job.status === "abierto" || job.status === "en_progreso") && (
          <button disabled={isPending} onClick={() => handleStatusChange("cancelado")} className="btn-ghost !px-3 !py-1.5 text-xs">
            Cancelar
          </button>
        )}
        <button disabled={isPending} onClick={handleDelete} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600">
          Eliminar
        </button>
      </div>
    </div>
  );
}
