import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import {
  formatCurrency,
  payTypeLabel,
  jobStatusColor,
  jobStatusLabel,
  formatDate,
  initials,
} from "@/lib/utils";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplicantRow } from "@/components/ApplicantRow";
import { RatingForm } from "@/components/RatingForm";
import { RatingStars } from "@/components/RatingStars";
import type { JobWithEmployer, ApplicationWithProfiles, RatingSummary } from "@/lib/types";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city)")
    .eq("id", params.id)
    .single();

  if (!job) notFound();

  const typedJob = job as unknown as JobWithEmployer;
  const isOwner = user?.id === typedJob.employer_id;

  const { data: employerRating } = await supabase
    .from("rating_summary")
    .select("*")
    .eq("profile_id", typedJob.employer_id)
    .maybeSingle();

  let applications: ApplicationWithProfiles[] = [];
  let myApplication: ApplicationWithProfiles | null = null;

  if (isOwner) {
    const { data } = await supabase
      .from("job_applications")
      .select("*, worker:profiles!job_applications_worker_id_fkey(*)")
      .eq("job_id", typedJob.id)
      .order("created_at", { ascending: false });
    applications = (data as unknown as ApplicationWithProfiles[]) ?? [];
  } else if (profile?.role === "worker" && user) {
    const { data } = await supabase
      .from("job_applications")
      .select("*")
      .eq("job_id", typedJob.id)
      .eq("worker_id", user.id)
      .maybeSingle();
    myApplication = (data as unknown as ApplicationWithProfiles) ?? null;
  }

  const jobCompleted = typedJob.status === "completado";
  const isAssignedWorker = user?.id === typedJob.assigned_worker_id;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{typedJob.title}</h1>
            <p className="mt-1 text-slate-500">
              {typedJob.category} · {typedJob.city}
            </p>
          </div>
          <span className={`badge ${jobStatusColor(typedJob.status)}`}>
            {jobStatusLabel(typedJob.status)}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Pago</p>
            <p className="mt-1 font-semibold text-primary-700">
              {formatCurrency(typedJob.pay_amount)}{" "}
              <span className="font-normal text-slate-500">{payTypeLabel(typedJob.pay_type)}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Publicado</p>
            <p className="mt-1 text-slate-700">{formatDate(typedJob.created_at)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase text-slate-400">Descripción</p>
          <p className="mt-2 whitespace-pre-line text-slate-700">{typedJob.description}</p>
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
            {initials(typedJob.employer?.full_name ?? "?")}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">{typedJob.employer?.full_name}</p>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {employerRating ? (
                <>
                  <RatingStars value={Math.round(employerRating.average_score)} readOnly size="sm" />
                  <span>
                    {employerRating.average_score} ({employerRating.total_ratings} reseñas)
                  </span>
                </>
              ) : (
                <span>Sin calificaciones aún</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Postular (trabajador, trabajo abierto) */}
      {profile?.role === "worker" && typedJob.status === "abierto" && !isOwner && (
        <div className="mt-6 card p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Postular a este trabajo</h2>
          {myApplication ? (
            <p className="text-sm text-slate-500">
              Ya enviaste tu postulación. Estado: <strong>{myApplication.status}</strong>
            </p>
          ) : (
            <ApplyForm jobId={typedJob.id} />
          )}
        </div>
      )}

      {!user && typedJob.status === "abierto" && (
        <div className="mt-6 card p-6 text-center">
          <p className="text-slate-600">
            <a href="/login" className="font-medium text-primary-700 hover:underline">
              Inicia sesión
            </a>{" "}
            como trabajador para postular a este trabajo.
          </p>
        </div>
      )}

      {/* Lista de postulantes (empleador dueño) */}
      {isOwner && (
        <div className="mt-6 card p-6">
          <h2 className="mb-2 font-semibold text-slate-900">
            Postulantes ({applications.length})
          </h2>
          {applications.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay postulaciones.</p>
          ) : (
            <div>
              {applications.map((app) => (
                <ApplicantRow
                  key={app.id}
                  applicationId={app.id}
                  status={app.status}
                  worker={app.worker!}
                  canManage={typedJob.status === "abierto"}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calificación mutua al completar el trabajo */}
      {jobCompleted && user && (isOwner || isAssignedWorker) && (
        <div className="mt-6">
          {isOwner && typedJob.assigned_worker_id && (
            <RatingForm
              jobId={typedJob.id}
              ratedId={typedJob.assigned_worker_id}
              ratedName="el trabajador"
            />
          )}
          {isAssignedWorker && (
            <RatingForm
              jobId={typedJob.id}
              ratedId={typedJob.employer_id}
              ratedName={typedJob.employer?.full_name ?? "el empleador"}
            />
          )}
        </div>
      )}
    </div>
  );
}
