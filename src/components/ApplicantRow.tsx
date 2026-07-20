"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplicationStatus } from "@/lib/actions/jobs";
import { applicationStatusLabel, initials } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface ApplicantRowProps {
  applicationId: string;
  status: string;
  worker: Profile;
  canManage: boolean;
}

export function ApplicantRow({ applicationId, status, worker, canManage }: ApplicantRowProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleUpdate(newStatus: string) {
    startTransition(async () => {
      await updateApplicationStatus(applicationId, newStatus);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
          {initials(worker.full_name)}
        </span>
        <div>
          <p className="text-sm font-medium text-slate-900">{worker.full_name}</p>
          <p className="text-xs text-slate-500">
            {worker.category ?? "Sin categoría"} · {worker.city ?? "Sin ciudad"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status === "pendiente" && canManage ? (
          <>
            <button
              disabled={isPending}
              onClick={() => handleUpdate("aceptado")}
              className="btn-primary !px-3 !py-1.5 text-xs"
            >
              Aceptar
            </button>
            <button
              disabled={isPending}
              onClick={() => handleUpdate("rechazado")}
              className="btn-ghost !px-3 !py-1.5 text-xs"
            >
              Rechazar
            </button>
          </>
        ) : (
          <span className="badge bg-slate-100 text-slate-600">{applicationStatusLabel(status)}</span>
        )}
      </div>
    </div>
  );
}
