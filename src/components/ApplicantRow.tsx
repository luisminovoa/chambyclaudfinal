"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X, MapPin, AlertCircle, Star, UserCircle2 } from "lucide-react";
import { updateApplicationStatus } from "@/lib/actions/jobs";
import { applicationStatusLabel } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";
import type { Profile, RatingSummary } from "@/lib/types";

interface ApplicantRowProps {
  applicationId: string;
  jobId: string;
  status: string;
  worker: Profile;
  occupation?: string | null;
  ratingSummary?: RatingSummary | null;
  canManage: boolean;
}

export function ApplicantRow({
  applicationId,
  jobId,
  status,
  worker,
  occupation,
  ratingSummary,
  canManage,
}: ApplicantRowProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const toast = useToast();

  function handleReject() {
    setConfirmingAccept(false);
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, "rechazado");
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Postulante rechazado", "info");
      }
    });
  }

  function handleAcceptConfirmed() {
    setConfirmingAccept(false);
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, "aceptado");
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast(`${worker.full_name} contratado con éxito`, "success");
      }
    });
  }

  return (
    <div className="border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={worker.full_name} src={worker.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{worker.full_name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
              {occupation || worker.category || "Sin categoría"}
              <span aria-hidden>·</span>
              <MapPin className="h-3 w-3" />
              {worker.city ?? "Sin ciudad"}
            </p>
            {ratingSummary ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ink">
                <Star className="h-3 w-3 fill-current text-warning-500" />
                {ratingSummary.average_score} · {ratingSummary.total_ratings} reseñas
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-ink-muted">Sin calificaciones aún</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/workers/${worker.id}?job=${jobId}`}
            className="btn-secondary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            Ver perfil
          </Link>
          {status === "pendiente" && canManage && !confirmingAccept ? (
            <>
              <button
                disabled={isPending}
                onClick={() => setConfirmingAccept(true)}
                className="btn-accent !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
              >
                <Check className="h-3.5 w-3.5" />
                Aceptar
              </button>
              <button
                disabled={isPending}
                onClick={handleReject}
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

      {/* Confirmación inline de aceptar */}
      {confirmingAccept && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-warning-700">
              Vas a contratar a <strong>{worker.full_name}</strong>. Las demás postulaciones pendientes
              se rechazarán automáticamente y se abrirá un chat privado.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                disabled={isPending}
                onClick={handleAcceptConfirmed}
                className="btn-accent !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Confirmar contratación
              </button>
              <button
                disabled={isPending}
                onClick={() => setConfirmingAccept(false)}
                className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
