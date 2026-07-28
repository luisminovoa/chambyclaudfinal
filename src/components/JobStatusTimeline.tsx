import { CheckCircle2, Circle, Clock } from "lucide-react";
import { jobStatusLabel, formatDate } from "@/lib/utils";
import type { StateHistoryEntry } from "@/lib/types";

interface JobStatusTimelineProps {
  currentStatus: string;
  history: StateHistoryEntry[];
  createdAt: string;
}

const STEPS = [
  { status: "abierto", label: "Publicado" },
  { status: "en_progreso", label: "Trabajador contratado" },
  { status: "completado", label: "Completado" },
] as const;

export function JobStatusTimeline({ currentStatus, history, createdAt }: JobStatusTimelineProps) {
  function timestampFor(targetStatus: string): string | null {
    if (targetStatus === "abierto") return createdAt;
    const entry = history.find((h) => h.new_status === targetStatus);
    return entry?.created_at ?? null;
  }

  const isCancelled = currentStatus === "cancelado";
  const cancelledAt = history.find((h) => h.new_status === "cancelado")?.created_at ?? null;

  return (
    <div className="mt-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Estado del trabajo
      </p>

      {isCancelled ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3">
          <Circle className="h-4 w-4 shrink-0 text-danger-500" />
          <div>
            <p className="text-sm font-bold text-danger-700">Cancelado</p>
            {cancelledAt && (
              <p className="text-xs text-danger-500">{formatDate(cancelledAt)}</p>
            )}
          </div>
        </div>
      ) : (
        <ol className="relative space-y-0 border-l border-slate-200 pl-4">
          {STEPS.map((step, i) => {
            const ts = timestampFor(step.status);
            const isReached =
              step.status === "abierto" ||
              history.some((h) => h.new_status === step.status) ||
              currentStatus === step.status;
            const isCurrent = currentStatus === step.status;
            const isLast = i === STEPS.length - 1;

            return (
              <li key={step.status} className={isLast ? "pb-0" : "pb-5"}>
                <span
                  className={[
                    "absolute -left-[9px] flex h-4.5 w-4.5 items-center justify-center rounded-full",
                    isReached
                      ? "bg-primary-600 text-white"
                      : "border border-slate-300 bg-white",
                  ].join(" ")}
                  aria-hidden
                >
                  {isReached ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3 text-slate-400" />
                  )}
                </span>
                <div className="pl-2">
                  <p
                    className={[
                      "text-sm font-semibold",
                      isCurrent ? "text-primary-700" : isReached ? "text-ink" : "text-ink-muted",
                    ].join(" ")}
                  >
                    {step.label}
                    {isCurrent && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary-500">
                        <Clock className="h-3 w-3" />
                        Actual
                      </span>
                    )}
                  </p>
                  {ts && (
                    <p className="text-xs text-ink-muted">{formatDate(ts)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
