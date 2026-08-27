"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X, MessageCircle, AlertCircle, Bookmark } from "lucide-react";
import { updateApplicationStatus } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { HiringConversations } from "@/components/chat/HiringConversations";
import type { HiringConversation } from "@/lib/actions/chat";

// Mismo patrón que JobCardActions (src/components/JobCardActions.tsx) para
// "guardar" un trabajo: bookmark client-only en localStorage, sin tabla
// nueva ni endpoint — no hay lectura entre dispositivos, es una lista
// local del navegador, igual que "guardar empleo".
const SAVED_WORKERS_KEY = "chamby:saved-workers";

function readSavedWorkers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_WORKERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface WorkerProfileActionsProps {
  /**
   * null cuando se llega desde el directorio (/workers → card → perfil,
   * sin ?job=) — Fase C4-G5. En ese caso solo "Guardar trabajador" debe
   * quedar disponible; el resto de acciones ya dependen de datos que solo
   * existen con un job real (application/conversationId/canManage), así
   * que se ocultan solas sin necesidad de una condición extra aquí.
   */
  jobId: string | null;
  workerId: string;
  workerName: string;
  application: { id: string; status: string } | null;
  conversationId: string | null;
  /** Solo el empleador dueño del job ve Aceptar/Rechazar — lo decide el server. */
  canManage: boolean;
  /**
   * Conversaciones existentes con este trabajador, resueltas por
   * getHiringConversations() (Fase C4-G6) — solo se usan cuando NO hay
   * jobId (llegada desde el directorio, sin contexto de una chamba
   * puntual). Con jobId, el flujo existente (conversationId de ESE job)
   * sigue mandando exactamente igual.
   */
  hiringConversations?: HiringConversation[];
}

export function WorkerProfileActions({
  jobId,
  workerId,
  workerName,
  application,
  conversationId,
  canManage,
  hiringConversations = [],
}: WorkerProfileActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(readSavedWorkers().includes(workerId));
  }, [workerId]);

  function toggleSaveWorker() {
    const current = readSavedWorkers();
    const next = current.includes(workerId)
      ? current.filter((id) => id !== workerId)
      : [...current, workerId];
    localStorage.setItem(SAVED_WORKERS_KEY, JSON.stringify(next));
    const nowSaved = next.includes(workerId);
    setSaved(nowSaved);
    toast(nowSaved ? "Trabajador guardado" : "Trabajador eliminado de guardados", "info");
  }

  function handleReject() {
    if (!application || !jobId) return;
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
    if (!application || !jobId) return;
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

  // Boolean(jobId) es una comprobación defensiva, no solo incidental: sin
  // jobId, canManage ya llega en false desde getWorkerPublicProfile() (solo
  // se calcula dentro de la rama `if (jobId)`), pero este componente no debe
  // depender de que el caller mantenga esa invariante — Aceptar/Rechazar
  // nunca deben aparecer sin un job real, sea cual sea el valor de canManage.
  const canDecide = Boolean(jobId) && canManage && application?.status === "pendiente";

  return (
    <div className="card space-y-3 p-5">
      {jobId && (
        <Link
          href={`/jobs/${jobId}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la publicación
        </Link>
      )}

      {jobId && conversationId && (
        <Link href={`/messages/${conversationId}`} className="btn-secondary w-full justify-center">
          <MessageCircle className="h-4 w-4" />
          💬 Abrir chat
        </Link>
      )}

      {!jobId && <HiringConversations conversations={hiringConversations} />}

      <button
        type="button"
        onClick={toggleSaveWorker}
        aria-pressed={saved}
        className={cn(
          "btn-secondary w-full justify-center",
          saved && "!bg-primary-50 !text-primary-600"
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
        {saved ? "Trabajador guardado" : "Guardar trabajador"}
      </button>

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
                className="btn-accent !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Confirmar contratación
              </button>
              <button
                disabled={isPending}
                onClick={() => setConfirmingAccept(false)}
                className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
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
