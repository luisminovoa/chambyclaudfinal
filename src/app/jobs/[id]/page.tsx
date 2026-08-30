import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Wallet, CalendarDays, Users, FileText, ChevronRight, PartyPopper } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getConversationIdForJob } from "@/lib/actions/chat";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import { formatLocation } from "@/lib/location";
import { formatCurrency, payTypeLabel, jobStatusLabel, formatDate } from "@/lib/utils";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplicantRow } from "@/components/ApplicantRow";
import { RatingForm } from "@/components/RatingForm";
import { RatingStars } from "@/components/RatingStars";
import { JobStatusTimeline } from "@/components/JobStatusTimeline";
import { AssignedWorkerCard } from "@/components/AssignedWorkerCard";
import { JobActions } from "@/components/JobActions";
import { WithdrawButton } from "@/components/WithdrawButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobCardActions } from "@/components/JobCardActions";
import { canShowApplyButton } from "@/lib/job-apply-access";
import type {
  JobWithEmployer,
  ApplicationWithProfiles,
  RatingSummary,
  StateHistoryEntry,
  PublicWorkerSummary,
  WorkerProfileDetails,
} from "@/lib/types";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select("title, description, city, category, department, province, district")
    .eq("id", params.id)
    .maybeSingle();
  const job = data as unknown as Pick<
    JobWithEmployer,
    "title" | "description" | "city" | "category" | "department" | "province" | "district"
  > | null;

  if (!job) return { title: "Trabajo no encontrado" };

  const description = job.description.slice(0, 155);
  return {
    title: `${job.title} en ${formatLocation(job) ?? job.city}`,
    description,
    openGraph: { title: `${job.title} — Chamby`, description },
  };
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!job) notFound();

  const jobBase = job as unknown as Omit<JobWithEmployer, "employer">;
  const isOwner = user?.id === jobBase.employer_id;
  const isAssignedWorker = user?.id === jobBase.assigned_worker_id;
  // El botón del header solo debe aparecer si el trabajo sigue abierto —
  // a diferencia de las tarjetas de listado (que ya solo traen trabajos
  // "abierto"), esta página muestra cualquier estado.
  const showApply =
    canShowApplyButton({ viewerRole: profile?.role ?? null, isOwner }) && jobBase.status === "abierto";
  const jobCompleted = jobBase.status === "completado";

  // Fetch en paralelo: perfil público del empleador, su calificación,
  // historial de estados, perfil público del trabajador asignado. El
  // empleador y el trabajador asignado son terceros (no auth.uid() ni
  // admin necesariamente) — se leen de public.public_profiles, no de
  // profiles directamente, para no depender de un embed `profiles!fkey`
  // que la RLS de 0034_harden_profiles_public_access.sql ya no permite
  // resolver para un tercero. Ver esa migración: la vista nunca expone
  // phone/business_ruc.
  const [employerRes, employerRatingRes, stateHistoryRes, assignedWorkerRes, assignedWorkerConversationId] =
    await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, full_name, avatar_url, city")
      .eq("id", jobBase.employer_id)
      .maybeSingle(),
    supabase
      .from("rating_summary")
      .select("*")
      .eq("profile_id", jobBase.employer_id)
      .maybeSingle(),
    (isOwner || isAssignedWorker) && user
      ? supabase
          .from("job_state_history")
          .select("*")
          .eq("job_id", jobBase.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    jobBase.assigned_worker_id
      ? supabase
          .from("public_profiles")
          .select("id, full_name, avatar_url, category, city")
          .eq("id", jobBase.assigned_worker_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Fase C4-G6: "Abrir chat" en AssignedWorkerCard — solo tiene sentido
    // consultarlo si hay trabajador asignado y el viewer es participante
    // real del job (RLS de conversations igual lo exigiría, esto solo evita
    // la consulta cuando ya sabemos que no aplica).
    jobBase.assigned_worker_id && (isOwner || isAssignedWorker)
      ? getConversationIdForJob(jobBase.id)
      : Promise.resolve(null),
  ]);

  const typedJob: JobWithEmployer = {
    ...jobBase,
    employer: (employerRes.data as unknown as JobWithEmployer["employer"]) ?? null,
  };
  const employerRating = employerRatingRes.data as unknown as RatingSummary | null;
  const stateHistory = (stateHistoryRes.data as unknown as StateHistoryEntry[]) ?? [];
  const assignedWorker = assignedWorkerRes.data as unknown as PublicWorkerSummary | null;

  // Assigned worker rating (only when worker is assigned)
  const workerRatingRes = assignedWorker
    ? await supabase
        .from("rating_summary")
        .select("*")
        .eq("profile_id", assignedWorker.id)
        .maybeSingle()
    : null;
  const workerRating = workerRatingRes?.data as unknown as RatingSummary | null;

  let applications: ApplicationWithProfiles[] = [];
  let myApplication: ApplicationWithProfiles | null = null;
  const applicantOccupations = new Map<string, string>();
  const applicantRatings = new Map<string, RatingSummary>();

  if (isOwner) {
    const { data } = await supabase
      .from("job_applications")
      .select("id, job_id, worker_id, status, message, created_at, updated_at")
      .eq("job_id", typedJob.id)
      .order("created_at", { ascending: false });
    const applicationRows =
      (data as unknown as Omit<ApplicationWithProfiles, "worker" | "job">[]) ?? [];

    const workerIds = applicationRows.map((a) => a.worker_id);
    let workerById = new Map<string, PublicWorkerSummary>();
    if (workerIds.length > 0) {
      // Ya confirmamos isOwner arriba — relación legítima para leer estos
      // perfiles (owner-only por la relación job_applications.job_id, no
      // por RLS de profiles) — mismo patrón que getWorkerPublicProfile en
      // src/lib/actions/workers.ts: cliente admin + lista blanca explícita
      // de columnas, nunca select("*"). Nunca se pide phone/business_ruc.
      const admin = createAdminClient();
      const [workersRes, detailsRes, ratingsRes] = await Promise.all([
        admin
          .from("profiles")
          .select("id, full_name, avatar_url, category, city")
          .in("id", workerIds),
        admin.from("worker_profile_details").select("*").in("profile_id", workerIds),
        supabase.from("rating_summary").select("*").in("profile_id", workerIds),
      ]);
      workerById = new Map(
        ((workersRes.data as unknown as PublicWorkerSummary[]) ?? []).map((w) => [w.id, w])
      );
      const detailsByWorker = new Map(
        ((detailsRes.data as unknown as WorkerProfileDetails[]) ?? []).map((d) => [d.profile_id, d])
      );
      for (const app of applicationRows) {
        const worker = workerById.get(app.worker_id);
        if (worker) {
          applicantOccupations.set(
            app.worker_id,
            getWorkerPrimaryTitle(worker, detailsByWorker.get(app.worker_id) ?? null)
          );
        }
      }
      for (const r of (ratingsRes.data as unknown as RatingSummary[]) ?? []) {
        applicantRatings.set(r.profile_id, r);
      }
    }

    applications = applicationRows
      .filter((a) => workerById.has(a.worker_id))
      .map((a) => ({ ...a, worker: workerById.get(a.worker_id)!, job: null }));
  } else if (profile?.role === "worker" && user) {
    const { data } = await supabase
      .from("job_applications")
      .select("*")
      .eq("job_id", typedJob.id)
      .eq("worker_id", user.id)
      .maybeSingle();
    myApplication = (data as unknown as ApplicationWithProfiles) ?? null;
  }

  // JSON-LD for Google Jobs (open listings only)
  const jobPostingJsonLd =
    typedJob.status === "abierto"
      ? {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: typedJob.title,
          description: typedJob.description,
          datePosted: typedJob.created_at,
          employmentType: "TEMPORARY",
          hiringOrganization: {
            "@type": "Organization",
            name: typedJob.employer?.full_name ?? "Chamby",
          },
          jobLocation: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              // addressLocality es un campo semántico de localidad — usa
              // el distrito (el nivel más específico y comparable a una
              // "ciudad") con fallback a `city` legacy, nunca la cadena
              // completa "Distrito, Provincia, Departamento" de
              // formatLocation() (esa es solo para presentación).
              addressLocality: typedJob.district || typedJob.city,
              addressCountry: "PE",
            },
          },
          ...(typedJob.pay_amount
            ? {
                baseSalary: {
                  "@type": "MonetaryAmount",
                  currency: "PEN",
                  value: { "@type": "QuantitativeValue", value: typedJob.pay_amount },
                },
              }
            : {}),
        }
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      {jobPostingJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jobPostingJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      {/* Breadcrumb */}
      <Reveal y={8}>
        <nav aria-label="Miga de pan" className="mb-4 flex items-center gap-1 text-xs font-medium text-ink-muted">
          <Link href="/" className="transition-colors hover:text-primary-600">Inicio</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/jobs" className="transition-colors hover:text-primary-600">Trabajos</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1 text-ink">{typedJob.title}</span>
        </nav>
      </Reveal>

      {/* Banner: trabajador contratado */}
      {isAssignedWorker && typedJob.status === "en_progreso" && (
        <Reveal>
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-success-100 bg-success-50 px-5 py-4">
            <PartyPopper className="h-6 w-6 shrink-0 text-success-600" />
            <div>
              <p className="text-sm font-bold text-success-700">¡Fuiste contratado para este trabajo!</p>
              <p className="text-xs text-success-600">
                El empleador te ha seleccionado. Coordina los detalles directamente con él.
              </p>
            </div>
          </div>
        </Reveal>
      )}

      {/* Card principal del trabajo */}
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
                  {typedJob.category} · {formatLocation(typedJob)}
                  {typedJob.address ? ` · ${typedJob.address}` : ""}
                </p>
              </div>
              <JobCardActions
                jobId={typedJob.id}
                jobTitle={typedJob.title}
                isOwner={isOwner}
                showApply={showApply}
                scrollTargetId="postular"
              />
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
            <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={typedJob.employer?.full_name ?? "?"} src={typedJob.employer?.avatar_url} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{typedJob.employer?.full_name}</p>
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
              <Link
                href={`/employers/${typedJob.employer_id}`}
                className="btn-secondary shrink-0 !rounded-xl !px-3 !py-2 text-xs"
              >
                Ver empleador
              </Link>
            </div>

            {/* Trabajador asignado */}
            {assignedWorker && (isOwner || isAssignedWorker) && (
              <AssignedWorkerCard
                worker={assignedWorker}
                rating={workerRating}
                conversationId={assignedWorkerConversationId}
              />
            )}

            {/* Timeline de estados (solo para participantes) */}
            {(isOwner || isAssignedWorker) && (
              <JobStatusTimeline
                currentStatus={typedJob.status}
                history={stateHistory}
                createdAt={typedJob.created_at}
              />
            )}

            {/* Botones de acción del empleador */}
            {isOwner && (
              <JobActions jobId={typedJob.id} jobStatus={typedJob.status} />
            )}
          </div>
        </div>
      </Reveal>

      {/* Postular (trabajador, trabajo abierto) */}
      {profile?.role === "worker" && typedJob.status === "abierto" && !isOwner && (
        <Reveal delay={0.05}>
          <div id="postular" className="card mt-6 scroll-mt-20 p-6">
            <h2 className="text-base font-bold text-ink">Postular a este trabajo</h2>
            {myApplication ? (
              <div className="mt-4 rounded-2xl bg-primary-50/60 p-4">
                <div className="flex items-center gap-3">
                  <Badge tone={jobStatusTone(myApplication.status)}>
                    {myApplication.status === "pendiente" ? "Postulación enviada" : myApplication.status}
                  </Badge>
                  <p className="text-sm text-ink-muted">Ya enviaste tu postulación a este trabajo.</p>
                </div>
                {myApplication.status === "pendiente" && (
                  <div className="mt-3">
                    <WithdrawButton applicationId={myApplication.id} />
                  </div>
                )}
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
          <div id="postular" className="card mt-6 scroll-mt-20 p-8 text-center">
            <p className="text-ink-muted">
              <Link
                href={`/login?next=${encodeURIComponent(`/jobs/${typedJob.id}`)}`}
                className="font-bold text-primary-600 transition-colors hover:text-primary-700"
              >
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
                  pose="search"
                  title="La hormiguita sigue buscando candidatos"
                  description="Comparte el enlace del trabajo para llegar a más postulantes."
                />
              </div>
            ) : (
              <div className="mt-2">
                {applications.map((app) => (
                  <ApplicantRow
                    key={app.id}
                    applicationId={app.id}
                    jobId={typedJob.id}
                    status={app.status}
                    worker={app.worker!}
                    occupation={applicantOccupations.get(app.worker_id)}
                    ratingSummary={applicantRatings.get(app.worker_id) ?? null}
                    canManage={typedJob.status === "abierto"}
                  />
                ))}
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* Calificación mutua al completar */}
      {jobCompleted && user && (isOwner || isAssignedWorker) && (
        <Reveal delay={0.05}>
          <div id="rating" className="mt-6">
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
