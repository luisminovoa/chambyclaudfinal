import Link from "next/link";
import type { JobWithEmployer } from "@/lib/types";
import { formatCurrency, payTypeLabel, jobStatusColor, jobStatusLabel, formatDate } from "@/lib/utils";

export function JobCard({ job }: { job: JobWithEmployer }) {
  return (
    <Link href={`/jobs/${job.id}`} className="card block p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{job.title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {job.category} · {job.city}
          </p>
        </div>
        <span className={`badge shrink-0 ${jobStatusColor(job.status)}`}>
          {jobStatusLabel(job.status)}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{job.description}</p>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="font-semibold text-primary-700">
          {formatCurrency(job.pay_amount)}{" "}
          <span className="font-normal text-slate-500">{payTypeLabel(job.pay_type)}</span>
        </span>
        <span className="text-xs text-slate-400">Publicado el {formatDate(job.created_at)}</span>
      </div>
    </Link>
  );
}
