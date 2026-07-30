import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, AssignmentStatus } from "@/lib/types";

const STEPS = ["Postulaste", "Preseleccionado", "Contratado", "En progreso", "Completado"];

function currentStep(
  applicationStatus: ApplicationStatus,
  assignmentStatus: AssignmentStatus | null
): number {
  if (assignmentStatus === "completado") return 4;
  if (assignmentStatus === "en_progreso") return 3;
  if (assignmentStatus) return 2;
  if (applicationStatus === "aceptado") return 2;
  if (applicationStatus === "preseleccionado") return 1;
  return 0;
}

export function ApplicationTimeline({
  applicationStatus,
  assignmentStatus = null,
}: {
  applicationStatus: ApplicationStatus;
  assignmentStatus?: AssignmentStatus | null;
}) {
  const cancelled =
    assignmentStatus === "cancelado" ||
    applicationStatus === "rechazado" ||
    applicationStatus === "retirado";

  if (cancelled) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-ink-muted">
        {applicationStatus === "retirado"
          ? "Retiraste esta postulación."
          : assignmentStatus === "cancelado"
            ? "Esta contratación fue cancelada."
            : "Esta postulación no fue seleccionada."}
      </p>
    );
  }

  const active = currentStep(applicationStatus, assignmentStatus);

  return (
    <ol className="flex items-start">
      {STEPS.map((label, i) => {
        const done = i <= active;
        return (
          <li key={label} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "bg-transparent" : done ? "bg-primary-500" : "bg-slate-200"
                )}
              />
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  done ? "bg-primary-500 text-white" : "bg-slate-200 text-slate-500"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === STEPS.length - 1
                    ? "bg-transparent"
                    : i < active
                      ? "bg-primary-500"
                      : "bg-slate-200"
                )}
              />
            </div>
            <span
              className={cn(
                "mt-1.5 text-[10px] font-semibold leading-tight sm:text-xs",
                done ? "text-ink" : "text-ink-muted"
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
