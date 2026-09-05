import Link from "next/link";
import { MapPin, User as UserIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { jobStatusLabel } from "@/lib/utils";
import { groupByDay, formatTimeRange } from "@/lib/calendar-format";
import type { CalendarJob } from "@/lib/actions/calendar";

interface CalendarAgendaProps {
  jobs: CalendarJob[];
  role: "worker" | "employer";
}

/**
 * FASE 3G — Secciones 2/3. Lista cronológica agrupada por día (NO un
 * grid tipo calendario de escritorio) — mobile-first: una columna,
 * sin scroll horizontal, funciona igual en 320px que en desktop.
 */
export function CalendarAgenda({ jobs, role }: CalendarAgendaProps) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        pose="wave"
        title="Tu agenda está libre"
        description={
          role === "worker"
            ? "Cuando confirmes un horario con un empleador, tus próximos trabajos aparecerán aquí."
            : "Cuando confirmes un horario con un trabajador, tus próximos trabajos aparecerán aquí."
        }
      />
    );
  }

  const groups = groupByDay(jobs, (j) => j.scheduled_start_at);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.items.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="card-hover flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-700">
                    {formatTimeRange(job.scheduled_start_at!, job.scheduled_end_at!)}
                  </p>
                  <p className="truncate text-sm font-semibold text-ink">{job.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                    {(job.district || job.city) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {job.district || job.city}
                      </span>
                    )}
                    {job.counterpartName && (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3 w-3 shrink-0" />
                        {job.counterpartName}
                      </span>
                    )}
                  </p>
                </div>
                <Badge tone={jobStatusTone(job.status)} className="shrink-0">
                  {jobStatusLabel(job.status)}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
