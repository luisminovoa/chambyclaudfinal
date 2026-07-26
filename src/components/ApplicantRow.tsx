"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, MapPin } from "lucide-react";
import { updateApplicationStatus } from "@/lib/actions/jobs";
import { applicationStatusLabel } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";
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
  const toast = useToast();

  function handleUpdate(newStatus: string) {
    startTransition(async () => {
      await updateApplicationStatus(applicationId, newStatus);
      toast(newStatus === "aceptado" ? "Postulante aceptado" : "Postulante rechazado", "info");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={worker.full_name} src={worker.avatar_url} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{worker.full_name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
            {worker.category ?? "Sin categoría"}
            <span aria-hidden>·</span>
            <MapPin className="h-3 w-3" />
            {worker.city ?? "Sin ciudad"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {status === "pendiente" && canManage ? (
          <>
            <button
              disabled={isPending}
              onClick={() => handleUpdate("aceptado")}
              className="btn-accent !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <Check className="h-3.5 w-3.5" />
              Aceptar
            </button>
            <button
              disabled={isPending}
              onClick={() => handleUpdate("rechazado")}
              className="btn-danger !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              Rechazar
            </button>
          </>
        ) : (
          <Badge tone={jobStatusTone(status)}>{applicationStatusLabel(status)}</Badge>
        )}
      </div>
    </div>
  );
}
