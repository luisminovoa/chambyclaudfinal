"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Play, CheckCircle2, XCircle, ThumbsUp, MessageSquare } from "lucide-react";
import {
  cancelAssignment,
  completeAssignment,
  confirmAssignment,
  startAssignment,
} from "@/lib/actions/applications";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { assignmentStatusLabel, formatCurrency, formatDate, payTypeLabel } from "@/lib/utils";
import type { AssignmentStatus } from "@/lib/types";

export interface AssignmentView {
  id: string;
  status: AssignmentStatus;
  agreedPay: number | null;
  createdAt: string;
  jobId: string;
  jobTitle: string;
  jobCity: string;
  jobDistrict: string | null;
  jobWorkDate: string | null;
  payType: string;
  counterpartId: string;
  counterpartName: string;
  counterpartAvatar: string | null;
}

export function AssignmentCard({
  assignment,
  viewer,
}: {
  assignment: AssignmentView;
  viewer: "employer" | "worker";
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function run(
    action: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.error) toast(res.error, "error");
      else {
        toast(successMessage, "success");
        router.refresh();
      }
    });
  }

  const active = assignment.status !== "completado" && assignment.status !== "cancelado";

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/jobs/${assignment.jobId}`}
            className="text-base font-bold text-ink transition-colors hover:text-primary-600"
          >
            {assignment.jobTitle}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {assignment.jobCity}
              {assignment.jobDistrict && ` · ${assignment.jobDistrict}`}
            </span>
            {assignment.jobWorkDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(assignment.jobWorkDate)}
              </span>
            )}
            <span className="font-semibold text-ink">
              {formatCurrency(assignment.agreedPay)} {payTypeLabel(assignment.payType)}
            </span>
          </p>
        </div>
        <Badge tone={jobStatusTone(assignment.status)}>
          {assignmentStatusLabel(assignment.status)}
        </Badge>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <Avatar name={assignment.counterpartName} src={assignment.counterpartAvatar} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{assignment.counterpartName}</p>
          <p className="text-xs text-ink-muted">
            {viewer === "employer" ? "Trabajador contratado" : "Empleador"}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <ApplicationTimeline applicationStatus="aceptado" assignmentStatus={assignment.status} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/messages"
          className="btn-secondary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </Link>

        {viewer === "worker" && assignment.status === "asignado" && (
          <button
            disabled={isPending}
            onClick={() => run(() => confirmAssignment(assignment.id), "Confirmaste tu participación")}
            className="btn-primary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Confirmar
          </button>
        )}

        {viewer === "employer" &&
          (assignment.status === "asignado" || assignment.status === "confirmado") && (
            <button
              disabled={isPending}
              onClick={() => run(() => startAssignment(assignment.id), "Trabajo iniciado")}
              className="btn-primary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <Play className="h-3.5 w-3.5" />
              Iniciar trabajo
            </button>
          )}

        {viewer === "employer" && active && (
          <button
            disabled={isPending}
            onClick={() => run(() => completeAssignment(assignment.id), "Trabajo completado")}
            className="btn-accent !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completar
          </button>
        )}

        {active && (
          <button
            disabled={isPending}
            onClick={() => setConfirmingCancel(true)}
            className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelar
          </button>
        )}

        {assignment.status === "completado" && (
          <Link
            href={`/jobs/${assignment.jobId}`}
            className="btn-accent !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            Calificar
          </Link>
        )}
      </div>

      {confirmingCancel && (
        <form
          className="mt-3 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3"
          action={(formData) => {
            setConfirmingCancel(false);
            const reason = String(formData.get("reason") ?? "");
            run(() => cancelAssignment(assignment.id, reason), "Contratación cancelada");
          }}
        >
          <label htmlFor={`reason-${assignment.id}`} className="label !text-danger-700">
            ¿Por qué cancelas esta contratación?
          </label>
          <input
            id={`reason-${assignment.id}`}
            name="reason"
            maxLength={500}
            placeholder="Motivo (opcional)"
            className="input mt-1"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="btn-danger !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
            >
              Sí, cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
