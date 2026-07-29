import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Wallet,
  CalendarDays,
  Users,
  Clock,
  Zap,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { formatCurrency, payTypeLabel, applicationStatusLabel } from "@/lib/utils";
import { ApplyForm } from "@/components/ApplyForm";
import { WithdrawButton } from "@/components/WithdrawButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { RatingStars } from "@/components/RatingStars";
import { ImageGallery } from "@/components/jobs/ImageGallery";
import { computeCompatibility } from "@/lib/compatibility";
import type { JobListing, RatingSummary, JobApplication } from "@/lib/types";

export default async function WorkerJobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect(`/login?next=/dashboard/worker/jobs/${params.id}`);
  if (!profile || (profile.role !== "worker" && profile.role !== "admin")) {
    redirect(`/jobs/${params.id}`);
  }

  const { data: job } = await supabase
    .from("jobs")
    .select(
      `*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city, is_active), job_images(id, public_url, display_order)`
    )
    .eq("id", params.id)
    .single();

  if (!job) notFound();

  const typedJob = job as unknown as JobListing & {
    job_images: Array<{ id: string; public_url: string; display_order: number }>;
  };

  const [employerRatingRes, myApplicationRes, employerJobsRes, expRes] =
    await Promise.all([
      supabase
        .from("rating_summary")
        .select("*")
        .eq("profile_id", typedJob.employer_id)
        .maybeSingle(),
      supabase
        .from("job_applications")
        .select("*")
        .eq("job_id", typedJob.id)
        .eq("worker_id", user.id)
        .maybeSingle(),
      supabase
        .from("jobs")
        .select("id, title, city")
        .eq("employer_id", typedJob.employer_id)
        .eq("status", "abierto")
        .neq("id", typedJob.id)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("job_applications")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", user.id)
        .eq("status", "aceptado"),
    ]);

  const employerRating = employerRatingRes.data as unknown as RatingSummary | null;
  const myApplication = myApplicationRes.data as unknown as JobApplication | null;
  const employerJobs = (employerJobsRes.data ?? []) as Array<{ id: string; title: string; city: string }>;
  const acceptedCount = expRes.count ?? 0;

  const images = typedJob.job_images
    ? [...typedJob.job_images].sort((a, b) => a.display_order - b.display_order)
    : [];
  const compatibility = computeCompatibility(profile, acceptedCount, typedJob);
  const isOpen = typedJob.status === "abierto";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/dashboard/worker/jobs" className="btn-ghost mb-5 text-sm">
        <ChevronLeft className="h-4 w-4" />
        Volver a chambas
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {images.length > 0 && (
            <Reveal>
              <ImageGallery images={images} />
            </Reveal>
          )}

          {/* Header card */}
          <Reveal>
            <div className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {typedJob.urgency === "urgente" && (
                    <Badge tone="danger" className="mb-2 gap-0.5">
                      <Zap className="h-3 w-3" />
                      Urgente
                    </Badge>
                  )}
                  <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                    {typedJob.title}
                  </h1>
                  <p className="mt-0.5 text-sm text-ink-muted">{typedJob.category}</p>
                </div>
                <Badge tone={jobStatusTone(typedJob.status)}>
                  {isOpen ? "Disponible" : typedJob.status}
                </Badge>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <div>
                    <dt className="text-xs text-ink-muted">Pago</dt>
                    <dd className="text-sm font-bold text-ink">
                      {formatCurrency(typedJob.pay_amount)}{" "}
                      <span className="text-xs font-normal text-ink-muted">
                        {payTypeLabel(typedJob.pay_type)}
                      </span>
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <div>
                    <dt className="text-xs text-ink-muted">Ubicación</dt>
                    <dd className="text-sm font-bold text-ink">
                      {typedJob.city}
                      {typedJob.district ? `, ${typedJob.district}` : ""}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <div>
                    <dt className="text-xs text-ink-muted">Vacantes</dt>
                    <dd className="text-sm font-bold text-ink">
                      {typedJob.positions_needed}
                    </dd>
                  </div>
                </div>
                {typedJob.work_date && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                    <div>
                      <dt className="text-xs text-ink-muted">Fecha</dt>
                      <dd className="text-sm font-bold text-ink">{typedJob.work_date}</dd>
                    </div>
                  </div>
                )}
                {typedJob.start_time && (
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                    <div>
                      <dt className="text-xs text-ink-muted">Hora inicio</dt>
                      <dd className="text-sm font-bold text-ink">{typedJob.start_time}</dd>
                    </div>
                  </div>
                )}
                {typedJob.estimated_duration && (
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                    <div>
                      <dt className="text-xs text-ink-muted">Duración</dt>
                      <dd className="text-sm font-bold text-ink">
                        {typedJob.estimated_duration}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              {typedJob.address && (
                <p className="mt-3 flex items-center gap-1 text-xs text-ink-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {typedJob.address}
                </p>
              )}
            </div>
          </Reveal>

          {/* Description */}
          <Reveal>
            <section className="card p-6" aria-labelledby="desc-heading">
              <h2 id="desc-heading" className="text-base font-bold text-ink">
                Descripción del trabajo
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {typedJob.description}
              </p>
            </section>
          </Reveal>

          {/* Requirements */}
          {typedJob.requirements && typedJob.requirements.length > 0 && (
            <Reveal>
              <section className="card p-6" aria-labelledby="req-heading">
                <h2 id="req-heading" className="text-base font-bold text-ink">
                  Requisitos
                </h2>
                <ul className="mt-3 space-y-2">
                  {typedJob.requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-start gap-2 text-sm text-ink-muted"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                      {req}
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Apply / status card */}
          <Reveal>
            <section className="card p-6" aria-labelledby="apply-heading">
              <h2 id="apply-heading" className="text-base font-bold text-ink">
                {myApplication ? "Tu postulación" : "Postular"}
              </h2>

              {/* Compatibility bar */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-all"
                    style={{ width: `${compatibility}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-primary-600">
                  {compatibility}%
                </span>
              </div>
              <p className="mb-4 mt-0.5 text-xs text-ink-muted">
                Compatibilidad con tu perfil
              </p>

              {myApplication ? (
                <div className="space-y-3">
                  <Badge tone={jobStatusTone(myApplication.status)}>
                    {applicationStatusLabel(myApplication.status)}
                  </Badge>
                  {myApplication.status === "pendiente" && (
                    <WithdrawButton applicationId={myApplication.id} />
                  )}
                  {myApplication.message && (
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <p className="text-xs font-semibold text-ink-muted mb-1">
                        Tu mensaje
                      </p>
                      <p className="text-xs text-ink leading-relaxed">
                        {myApplication.message}
                      </p>
                    </div>
                  )}
                </div>
              ) : isOpen ? (
                <ApplyForm jobId={typedJob.id} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Este trabajo ya no está disponible para postulaciones.
                </p>
              )}
            </section>
          </Reveal>

          {/* Employer card */}
          <Reveal>
            <section className="card p-6" aria-labelledby="employer-heading">
              <h2 id="employer-heading" className="text-base font-bold text-ink">
                Empleador
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <Avatar
                  name={typedJob.employer?.full_name ?? "?"}
                  src={typedJob.employer?.avatar_url}
                  size="md"
                />
                <div>
                  <p className="font-bold text-ink">
                    {typedJob.employer?.full_name}
                  </p>
                  {typedJob.employer?.city && (
                    <p className="text-xs text-ink-muted">
                      {typedJob.employer.city}
                    </p>
                  )}
                </div>
              </div>

              {typedJob.employer?.is_active && (
                <Badge tone="success" className="mt-2">
                  Perfil verificado
                </Badge>
              )}

              {employerRating && employerRating.total_ratings > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <RatingStars
                    value={Math.round(employerRating.average_score)}
                    readOnly
                    size="sm"
                  />
                  <span className="text-xs text-ink-muted">
                    {employerRating.average_score} ({employerRating.total_ratings}{" "}
                    reseñas)
                  </span>
                </div>
              )}

              {employerJobs.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Otros trabajos abiertos
                  </p>
                  <ul className="space-y-1.5">
                    {employerJobs.map((j) => (
                      <li key={j.id}>
                        <Link
                          href={`/dashboard/worker/jobs/${j.id}`}
                          className="text-sm font-medium text-primary-600 hover:underline"
                        >
                          {j.title}
                        </Link>
                        <p className="text-xs text-ink-muted">{j.city}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}
