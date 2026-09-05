"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Pencil } from "lucide-react";
import { proposeApplicationSchedule, confirmApplicationSchedule } from "@/lib/actions/calendar";
import { formatDate } from "@/lib/utils";
import { formatTimeRange } from "@/lib/calendar-format";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";

interface ScheduleProposalCardProps {
  applicationId: string;
  /** Estado de la POSTULACIÓN — fuera de 'pendiente' esta tarjeta no se muestra (ver 0054/0055). */
  status: string;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  workerScheduleConfirmedAt: string | null;
  viewerRole: "employer" | "worker";
}

function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * FASE 3G — Sección 8/9. Único componente para proponer (empleador) y
 * confirmar (worker) el horario de una postulación pendiente. Nunca
 * escribe `jobs.scheduled_*` directamente — eso lo hace 0055 al aceptar.
 * Toda la validación real (ownership, status, propuesta completa) vive
 * en proposeApplicationSchedule()/confirmApplicationSchedule()
 * (src/lib/actions/calendar.ts) y en el trigger de 0054; esto es solo UI.
 */
export function ScheduleProposalCard({
  applicationId,
  status,
  proposedStartAt,
  proposedEndAt,
  workerScheduleConfirmedAt,
  viewerRole,
}: ScheduleProposalCardProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const hasProposal = Boolean(proposedStartAt && proposedEndAt);
  const isConfirmed = Boolean(workerScheduleConfirmedAt);

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(proposedStartAt ? proposedStartAt.slice(0, 10) : "");
  const [startTime, setStartTime] = useState(proposedStartAt ? isoToLocalTime(proposedStartAt) : "");
  const [endTime, setEndTime] = useState(proposedEndAt ? isoToLocalTime(proposedEndAt) : "");
  const [formError, setFormError] = useState<string | null>(null);

  if (status !== "pendiente") return null;

  function handlePropose() {
    setFormError(null);
    if (!date || !startTime || !endTime) {
      setFormError("Completa fecha, hora de inicio y hora de fin.");
      return;
    }
    const startIso = new Date(`${date}T${startTime}`).toISOString();
    const endIso = new Date(`${date}T${endTime}`).toISOString();
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setFormError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    startTransition(async () => {
      const result = await proposeApplicationSchedule(applicationId, startIso, endIso);
      if (result.error) {
        // El error de proposeApplicationSchedule() ya viene traducido a un
        // mensaje legible (nunca SQL crudo) — nunca se oculta.
        toast(result.error, "error");
        setFormError(result.error);
      } else {
        toast("Horario propuesto", "success");
        setEditing(false);
      }
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmApplicationSchedule(applicationId);
      if (result.error) {
        toast(result.error, "error");
      } else {
        toast("Horario confirmado", "success");
      }
    });
  }

  if (viewerRole === "employer") {
    if (!hasProposal || editing) {
      return (
        <div className="mt-3 rounded-2xl border border-primary-100 bg-primary-50/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
            <CalendarClock className="h-3.5 w-3.5" />
            Proponer horario
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="date"
              aria-label="Fecha propuesta"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input !min-h-[40px] text-xs"
            />
            <input
              type="time"
              aria-label="Hora de inicio propuesta"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input !min-h-[40px] text-xs"
            />
            <input
              type="time"
              aria-label="Hora de fin propuesta"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input !min-h-[40px] text-xs"
            />
          </div>
          {formError && <p className="mt-1.5 text-xs font-medium text-danger-600">{formError}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handlePropose}
              className="btn-primary !rounded-xl !px-3 !py-1.5 text-xs"
            >
              {isPending ? "Enviando…" : "Proponer horario"}
            </button>
            {hasProposal && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setEditing(false)}
                className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <div className="min-w-0">
          <Badge tone={isConfirmed ? "success" : "warning"}>
            {isConfirmed ? "Horario confirmado" : "Horario propuesto"}
          </Badge>
          <p className="mt-1 text-xs font-semibold text-ink">
            {formatDate(proposedStartAt!)} · {formatTimeRange(proposedStartAt!, proposedEndAt!)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-ghost !rounded-xl !px-2.5 !py-1.5 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    );
  }

  // viewerRole === "worker"
  if (!hasProposal) return null;

  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold text-ink">
        {isConfirmed ? "Horario confirmado" : "Te propusieron este horario"}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {formatDate(proposedStartAt!)} · {formatTimeRange(proposedStartAt!, proposedEndAt!)}
      </p>
      {!isConfirmed && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleConfirm}
          className="btn-accent mt-2 !rounded-xl !px-3 !py-1.5 text-xs"
        >
          <Check className="h-3.5 w-3.5" />
          {isPending ? "Confirmando…" : "Confirmar horario"}
        </button>
      )}
    </div>
  );
}
