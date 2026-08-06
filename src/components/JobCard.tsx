import Link from "next/link";
import { MapPin, Clock, CalendarDays } from "lucide-react";
import type { JobWithEmployer } from "@/lib/types";
import { formatCurrency, payTypeLabel, jobStatusLabel, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { JobCardActions } from "@/components/JobCardActions";

interface JobCardProps {
  job: JobWithEmployer;
  currentUserId?: string | null;
}

export function JobCard({ job, currentUserId }: JobCardProps) {
  const isOwner = Boolean(currentUserId) && currentUserId === job.employer_id;
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
          {job.city}
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
        <JobCardActions jobId={job.id} jobTitle={job.title} isOwner={isOwner} />
      </div>
    </article>
  );
}
