import { Briefcase, CheckCircle2, Send, Loader2, Star } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { AdminUserProfileDetail } from "@/lib/actions/admin";

/**
 * Actividad — solo cuenta filas que ya existen (jobs, job_applications,
 * rating_summary); ninguna tabla nueva. Se muestran ambos lados (worker y
 * employer) porque una cuenta puede poseer los dos roles a la vez
 * (sistema multi-rol) — 0 es un valor real, no se oculta.
 */
export function AdminProfileActivity({ data }: { data: AdminUserProfileDetail }) {
  const { activity } = data;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-ink">Actividad</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Send} label="Postulaciones" value={activity.applicationsSubmitted} tone="primary" />
        <StatCard icon={Loader2} label="Trabajos en progreso" value={activity.jobsInProgressAsWorker} tone="warning" />
        <StatCard
          icon={CheckCircle2}
          label="Completados como trabajador"
          value={activity.jobsCompletedAsWorker}
          tone="success"
        />
        <StatCard icon={Briefcase} label="Trabajos publicados" value={activity.jobsPublished} tone="neutral" />
        <StatCard
          icon={CheckCircle2}
          label="Completados como empleador"
          value={activity.jobsCompletedAsEmployer}
          tone="success"
        />
        <StatCard icon={Star} label="Calificaciones recibidas" value={activity.ratingsReceived} tone="warning" />
      </div>
    </div>
  );
}
