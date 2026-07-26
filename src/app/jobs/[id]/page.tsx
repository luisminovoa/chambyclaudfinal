import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Wallet, CalendarDays, Users, FileText, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { formatCurrency, payTypeLabel, jobStatusLabel, formatDate } from "@/lib/utils";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplicantRow } from "@/components/ApplicantRow";
import { RatingForm } from "@/components/RatingForm";
import { RatingStars } from "@/components/RatingStars";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobCardActions } from "@/components/JobCardActions";
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

  const { data: employerRatingRaw } = await supabase
    .from("rating_summary")
    .select("*")
    .eq("profile_id", typedJob.employer_id)
    .maybeSingle();
  const employerRating = employerRatingRaw as unknown as RatingSummary | null;

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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Breadcrumb */}
      <Reveal y={8}>
        <nav aria-label="Miga de pan" className="mb-4 flex items-center gap-1 text-xs font-medium text-ink-muted">
          <Link href="/" className="transition-colors hover:text-primary-600">
            Inicio
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/jobs" className="transition-colors hover:text-primary-600">
            Trabajos
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1 text-ink">{typedJob.title}</span>
        </nav>
      </Reveal>

      <Reveal>
        <div className="card overflow-hidden">
          <div className="h-2 bg-brand-gradient" aria-hidden />
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge tone={jobStatusTone(typedJob.status)}>{jobStatusLabel(typedJob.status)}</Badge>
                <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                  {typedJob.title}
                </h1>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                  <MapPin className="h-4 w-4 text-primary-500" />
                  {typedJob.category} · {typedJob.city}
                  {typedJob.address ? ` · ${typedJob.address}` : ""}
                </p>
              </div>
              <JobCardActions jobId={typedJob.id} jobTitle={typedJob.title} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-primary-50/60 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600">
                  <Wallet className="h-3.5 w-3.5" />
                  Pago
                </p>
                <p className="mt-1.5 text-lg font-extrabold tracking-tight text-primary-700">
                  {formatCurrency(typedJob.pay_amount)}
                </p>
                <p className="text-xs font-medium text-ink-muted">{payTypeLabel(typedJob.pay_type)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Publicado
                </p>
                <p className="mt-1.5 text-sm font-bold text-ink">{formatDate(typedJob.created_at)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <Users className="h-3.5 w-3.5" />
                  Vacantes
                </p>
                <p className="mt-1.5 text-sm font-bold text-ink">
                  {typedJob.positions_needed} {typedJob.positions_needed === 1 ? "puesto" : "puestos"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <FileText className="h-3.5 w-3.5" />
                Descripción
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {typedJob.description}
              </p>
            </div>

            {/* Perfil del empleador */}
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <Avatar name={typedJob.employer?.full_name ?? "?"} src={typedJob.employer?.avatar_url} size="lg" />
              <div>
                <p className="text-sm font-bold text-ink">{typedJob.employer?.full_name}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                  {employerRating ? (
                    <>
                      <RatingStars value={Math.round(employerRating.average_score)} readOnly size="sm" />
                      <span className="font-medium">
                        {employerRating.average_score} · {employerRating.total_ratings} reseñas
                      </span>
                    </>
                  ) : (
                    <span>Sin calificaciones aún</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Postular (trabajador, trabajo abierto) */}
      {profile?.role === "worker" && typedJob.status === "abierto" && !isOwner && (
        <Reveal delay={0.05}>
          <div className="card mt-6 p-6">
            <h2 className="text-base font-bold text-ink">Postular a este trabajo</h2>
            {myApplication ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary-50/60 p-4">
                <Badge tone={jobStatusTone(myApplication.status)}>{myApplication.status}</Badge>
                <p className="text-sm text-ink-muted">Ya enviaste tu postulación a este trabajo.</p>
              </div>
            ) : (
              <div className="mt-4">
                <ApplyForm jobId={typedJob.id} />
              </div>
            )}
          </div>
        </Reveal>
      )}

      {!user && typedJob.status === "abierto" && (
        <Reveal delay={0.05}>
          <div className="card mt-6 p-8 text-center">
            <p className="text-ink-muted">
              <Link href="/login" className="font-bold text-primary-600 transition-colors hover:text-primary-700">
                Inicia sesión
              </Link>{" "}
              como trabajador para postular a este trabajo.
            </p>
          </div>
        </Reveal>
      )}

      {/* Lista de postulantes (empleador dueño) */}
      {isOwner && (
        <Reveal delay={0.05}>
          <div className="card mt-6 p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              Postulantes
              <Badge tone="primary">{applications.length}</Badge>
            </h2>
            {applications.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Users}
                  title="Aún no hay postulaciones"
                  description="Comparte el enlace del trabajo para llegar a más candidatos."
                />
              </div>
            ) : (
              <div className="mt-2">
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
        </Reveal>
      )}

      {/* Calificación mutua al completar el trabajo */}
      {jobCompleted && user && (isOwner || isAssignedWorker) && (
        <Reveal delay={0.05}>
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
        </Reveal>
      )}
    </div>
  );
}
