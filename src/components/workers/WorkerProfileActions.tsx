"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X, MessageCircle, AlertCircle } from "lucide-react";
import { updateApplicationStatus } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";

interface WorkerProfileActionsProps {
  jobId: string;
  workerName: string;
  application: { id: string; status: string } | null;
  conversationId: string | null;
  /** Solo el empleador dueño del job ve Aceptar/Rechazar — lo decide el server. */
  canManage: boolean;
}

export function WorkerProfileActions({
  jobId,
  workerName,
  application,
  conversationId,
  canManage,
}: WorkerProfileActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmingAccept, setConfirmingAccept] = useState(false);

  function handleReject() {
    if (!application) return;
    setConfirmingAccept(false);
    startTransition(async () => {
      const result = await updateApplicationStatus(application.id, "rechazado");
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Postulante rechazado", "info");
        router.push(`/jobs/${jobId}`);
      }
    });
  }

  function handleAcceptConfirmed() {
    if (!application) return;
    setConfirmingAccept(false);
    startTransition(async () => {
      const result = await updateApplicationStatus(application.id, "aceptado");
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast(`${workerName} contratado con éxito`, "success");
        router.push(`/jobs/${jobId}`);
      }
    });
  }

  const canDecide = canManage && application?.status === "pendiente";

  return (
    <div className="card space-y-3 p-5">
      <Link
        href={`/jobs/${jobId}`}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la publicación
      </Link>

      {conversationId && (
        <Link href={`/messages/${conversationId}`} className="btn-secondary w-full justify-center">
          <MessageCircle className="h-4 w-4" />
          Iniciar chat
        </Link>
      )}

      {canDecide && !confirmingAccept && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmingAccept(true)}
            className="btn-accent flex-1 justify-center !py-2 text-sm"
          >
            <Check className="h-4 w-4" />
            Aceptar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleReject}
            className="btn-danger flex-1 justify-center !py-2 text-sm"
          >
            <X className="h-4 w-4" />
            Rechazar
          </button>
        </div>
      )}

      {canDecide && confirmingAccept && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-warning-700">
              Vas a contratar a <strong>{workerName}</strong>. Las demás postulaciones pendientes se
              rechazarán automáticamente y se abrirá un chat privado.
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
