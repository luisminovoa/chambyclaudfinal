import Link from "next/link";
import { MapPin, Clock, CalendarDays } from "lucide-react";
import type { JobWithEmployer, UserRole } from "@/lib/types";
import { formatCurrency, payTypeLabel, jobStatusLabel, formatDate } from "@/lib/utils";
import { formatLocation } from "@/lib/location";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { JobCardActions } from "@/components/JobCardActions";
import { canShowApplyButton } from "@/lib/job-apply-access";

interface JobCardProps {
  job: JobWithEmployer;
  /**
   * Requerido (no opcional): un valor ausente colapsaría isOwner a false
   * silenciosamente y mostraría "Postular" en el trabajo propio del
   * empleador — exactamente el bug que dejó pasar /app/page.tsx antes de
   * este fix. Al ser obligatorio, un nuevo call site que lo olvide falla
   * en build (tsc/lint), no en producción.
   */
  currentUserId: string | null;
  /** Modo activo del usuario — decide si "Postular" se muestra (ver canShowApplyButton). */
  viewerRole: UserRole | null;
}

export function JobCard({ job, currentUserId, viewerRole }: JobCardProps) {
  const isOwner = Boolean(currentUserId) && currentUserId === job.employer_id;
  const showApply = canShowApplyButton({ viewerRole, isOwner });
  const location = formatLocation(job);

  return (
    <article className="card card-hover group relative flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={job.employer?.full_name ?? "?"} src={job.employer?.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink-muted">
              {job.employer?.full_name ?? "Empleador"}
            </p>
            <h3 className="truncate font-bold text-ink transition-colors duration-200 group-hover:text-primary-600">
              <Link href={`/jobs/${job.id}`} className="focus:outline-none">
                {/* El enlace expandido hace clicable toda la tarjeta */}
                <span className="absolute inset-0 z-0" aria-hidden />
                {job.title}
              </Link>
            </h3>
            <Link
              href={`/employers/${job.employer_id}`}
              className="relative z-10 inline-block text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline"
            >
              Ver empleador
            </Link>
          </div>
        </div>
        <Badge tone={jobStatusTone(job.status)} className="shrink-0">
          {jobStatusLabel(job.status)}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{job.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-primary-500" />
          {location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-primary-500" />
          {payTypeLabel(job.pay_type)}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5 text-primary-500" />
          {formatDate(job.created_at)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <p className="text-base font-extrabold tracking-tight text-primary-600">
          {formatCurrency(job.pay_amount)}
        </p>
        <JobCardActions jobId={job.id} jobTitle={job.title} isOwner={isOwner} showApply={showApply} />
      </div>
    </article>
  );
}
