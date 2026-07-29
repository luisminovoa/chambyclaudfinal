import Link from "next/link";
import { MapPin, Clock, CalendarDays, Zap, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { SaveJobButton } from "@/components/jobs/SaveJobButton";
import { formatCurrency, payTypeLabel, timeAgo } from "@/lib/utils";
import type { JobListing } from "@/lib/types";

interface WorkerJobCardProps {
  job: JobListing;
  compatibility?: number;
  isSaved: boolean;
  hasApplied: boolean;
}

export function WorkerJobCard({
  job,
  compatibility,
  isSaved,
  hasApplied,
}: WorkerJobCardProps) {
  const thumbnail = job.job_images
    ? [...job.job_images].sort((a, b) => a.display_order - b.display_order)[0]
        ?.public_url
    : null;

  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden">
      {thumbnail && (
        <div className="aspect-[16/7] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt={job.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              name={job.employer?.full_name ?? "?"}
              src={job.employer?.avatar_url}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-muted">
                {job.employer?.full_name}
              </p>
              <h3 className="truncate font-bold text-ink transition-colors duration-200 group-hover:text-primary-600">
                <Link
                  href={`/dashboard/worker/jobs/${job.id}`}
                  className="focus:outline-none"
                >
                  <span className="absolute inset-0 z-0" aria-hidden />
                  {job.title}
                </Link>
              </h3>
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 items-center gap-1">
            {job.urgency === "urgente" && (
              <Badge tone="danger" className="gap-0.5 text-[11px]">
                <Zap className="h-3 w-3" />
                Urgente
              </Badge>
            )}
            <SaveJobButton jobId={job.id} initialSaved={isSaved} />
          </div>
        </div>

        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
          {job.description}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-primary-500" />
            {job.city}
            {job.district ? `, ${job.district}` : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            {payTypeLabel(job.pay_type)}
          </span>
          {job.work_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-primary-500" />
              {job.work_date}
            </span>
          )}
          {job.positions_needed > 1 && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-primary-500" />
              {job.positions_needed} vacantes
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3.5 mt-3.5">
          <div>
            <p className="text-base font-extrabold tracking-tight text-primary-600">
              {formatCurrency(job.pay_amount)}
            </p>
            {compatibility !== undefined && (
              <p className="mt-0.5 text-xs text-ink-muted">
                {compatibility}% compatible
              </p>
            )}
            <p className="text-[11px] text-ink-muted">{timeAgo(job.created_at)}</p>
          </div>

          {hasApplied ? (
            <span className="rounded-xl bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
              Ya postulaste
            </span>
          ) : (
            <Link
              href={`/dashboard/worker/jobs/${job.id}`}
              className="btn-primary relative z-10 text-sm"
            >
              Ver detalles
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
