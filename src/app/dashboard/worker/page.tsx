import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Briefcase,
  ClipboardList,
  Star,
  CheckCircle2,
  MapPin,
  Award,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { RatingStars } from "@/components/RatingStars";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardProfileCard } from "@/components/profile/DashboardProfileCard";
import { WorkerJobReportButton } from "@/components/WorkerJobReportButton";
import {
  getProfileStats,
  getProfilePhotos,
  getVerificationDocuments,
  getWorkerProfileDetails,
  getWorkerExperience,
  computeAndSaveProfileStats,
} from "@/lib/actions/profile";
import {
  formatCurrency,
  payTypeLabel,
  jobStatusLabel,
  applicationStatusLabel,
  formatDate,
} from "@/lib/utils";
import type {
  ApplicationWithProfiles,
  RatingSummary,
  Rating,
  ProfileStats,
  ProfilePhoto,
  VerificationDocument,
  WorkerProfileDetails,
  WorkerExperience,
} from "@/lib/types";

export default async function WorkerDashboardPage() {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile && profile.role === "employer") redirect("/dashboard/employer");
  if (profile && profile.role === "admin") redirect("/admin");

  const [
    { data: applications },
    profilePhotos,
    verificationDocuments,
    profileStatsRaw,
    workerDetails,
    workerExperience,
  ] = await Promise.all([
    supabase
      .from("job_applications")
      .select("*, job:jobs(*)")
      .eq("worker_id", user.id)
      .order("created_at", { ascending: false }),
    getProfilePhotos(),
    getVerificationDocuments(),
    getProfileStats(),
    getWorkerProfileDetails(),
    getWorkerExperience(),
  ]);

  // Igual que en /dashboard/worker/profile: calcula stats en la primera
  // visita si todavía no existen (perfil recién creado).
  let profileStats: ProfileStats | null = profileStatsRaw;
  if (!profileStats) {
    const res = await computeAndSaveProfileStats();
    profileStats = "stats" in res ? (res.stats ?? null) : null;
  }

  const typedApps = (applications as unknown as ApplicationWithProfiles[]) ?? [];
  const activeApps = typedApps.filter(
    (a) => a.job && a.job.status !== "completado" && a.job.status !== "cancelado"
  );
  const history = typedApps.filter(
    (a) =>
      a.status === "aceptado" &&
      a.job &&
      (a.job.status === "completado" || a.job.status === "en_progreso")
  );
  const completedCount = typedApps.filter(
    (a) => a.status === "aceptado" && a.job?.status === "completado"
  ).length;

  const { data: ratingSummaryRaw } = await supabase
    .from("rating_summary")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const ratingSummary = ratingSummaryRaw as unknown as RatingSummary | null;

  const { data: recentRatings } = await supabase
    .from("ratings")
    .select("*")
    .eq("rated_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fase 8 (C4-G21): igual patrón que ratedJobIds en
  // /dashboard/employer/page.tsx (Fase 4 / C4-G14) — solo para decidir si
  // se muestra el CTA "Calificar empleador", consulta mínima filtrada por
  // `rater_id = user.id` (la sesión real). La autorización real de
  // calificar sigue viviendo enteramente en submitRating() (sin cambios).
  const completedJobIdsAsWorker = history
    .filter((a) => a.job?.status === "completado" && a.job.assigned_worker_id === user.id)
    .map((a) => a.job!.id);

  const { data: workerRatingsRaw } = await supabase
    .from("ratings")
    .select("job_id")
    .eq("rater_id", user.id)
    .in(
      "job_id",
      completedJobIdsAsWorker.length
        ? completedJobIdsAsWorker
        : ["00000000-0000-0000-0000-000000000000"]
    );

  const ratedJobIds = new Set(
    ((workerRatingsRaw ?? []) as { job_id: string }[]).map((r) => r.job_id)
  );

  const primaryPhoto = (profilePhotos as ProfilePhoto[]).find((p) => p.is_primary);
  const avatarSrc = primaryPhoto?.public_url ?? profile?.avatar_url ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              Hola, {profile?.full_name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1 text-ink-muted">Este es tu panel de trabajador.</p>
          </div>
          <Link href="/jobs" className="btn-primary">
            <Search className="h-4 w-4" />
            Buscar trabajos
          </Link>
        </div>
      </Reveal>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal>
          <StatCard icon={ClipboardList} label="Postulaciones activas" value={activeApps.length} />
        </Reveal>
        <Reveal delay={0.05}>
          <StatCard icon={Briefcase} label="En mi historial" value={history.length} tone="neutral" />
        </Reveal>
        <Reveal delay={0.1}>
          <StatCard icon={CheckCircle2} label="Completados" value={completedCount} tone="success" />
        </Reveal>
        <Reveal delay={0.15}>
          <StatCard
            icon={Star}
            label="Calificación"
            value={ratingSummary ? `${ratingSummary.average_score}` : "—"}
            tone="warning"
            hint={`${ratingSummary?.total_ratings ?? 0} reseñas`}
          />
        </Reveal>
      </div>

      {/* Fase 3 / C4-G12: el perfil es la identidad principal del trabajador
          y debe ser lo primero que ve, en cualquier viewport — reportado
          por un usuario real ("la parte de mi perfil debería ser lo
          principal y salir primero"). Antes vivía al final de un <aside>,
          después de Postulaciones/Historial/Reputación, sin ningún
          order-* de Tailwind — el orden DOM ya coincidía con el orden
          visual en mobile y desktop, así que la corrección es puramente
          de posición en el árbol (nunca CSS order), para que el orden
          visual, el orden de lectura de un lector de pantalla y la
          navegación por teclado sigan siendo el mismo orden. `<main>`
          reemplaza al `<aside>` artificial que antes alojaba Reputación +
          Perfil: ya no hay una columna "secundaria", todo el contenido de
          esta sección es el contenido principal del dashboard. */}
      <main className="mt-8 space-y-6">
        {profile && (
          <Reveal>
            <DashboardProfileCard
              profile={profile}
              avatarSrc={avatarSrc}
              stats={profileStats}
              photos={profilePhotos as ProfilePhoto[]}
              documents={verificationDocuments as VerificationDocument[]}
              workerDetails={workerDetails as WorkerProfileDetails | null}
              experience={workerExperience as WorkerExperience[]}
              ratingSummary={ratingSummary}
            />
          </Reveal>
        )}

        <Reveal delay={0.05}>
          <section className="card p-6" aria-labelledby="postulaciones-activas">
            <h2 id="postulaciones-activas" className="text-base font-bold text-ink">
              Postulaciones activas
            </h2>
            {activeApps.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  pose="search"
                  title="La hormiguita no encontró postulaciones activas"
                  description="Explora los trabajos disponibles y postula a tu próxima chamba."
                  actionLabel="Explorar trabajos"
                  actionHref="/jobs"
                />
              </div>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {activeApps.map((app) => (
                  <div
                    key={app.id}
                    className="-mx-3 flex flex-col gap-2 rounded-2xl px-3 py-3.5 transition-colors duration-200 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <Link href={`/jobs/${app.job_id}`} className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{app.job?.title}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-muted">
                        <MapPin className="h-3 w-3" />
                        {app.job?.city} · Postulaste el {formatDate(app.created_at)}
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {/* Fase 8 (C4-G21): reportar terminado solo aplica al
                          trabajador asignado de un job en_progreso. */}
                      {app.job?.status === "en_progreso" &&
                        app.job.assigned_worker_id === user.id && (
                          <WorkerJobReportButton
                            jobId={app.job_id}
                            workerReportedFinishedAt={app.job.worker_reported_finished_at}
                          />
                        )}
                      <Badge tone={jobStatusTone(app.status)}>
                        {applicationStatusLabel(app.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <section className="card p-6" aria-labelledby="historial">
            <h2 id="historial" className="text-base font-bold text-ink">
              Historial laboral
            </h2>
            {history.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  pose="briefcase"
                  title="Tu historial está vacío"
                  description="Cuando completes trabajos, la hormiguita los guardará aquí para construir tu reputación."
                />
              </div>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {history.map((app) => {
                  // Fase 8 (C4-G21): mismas tres condiciones ya validadas
                  // server-side por submitRating() (job completado, existe
                  // assigned_worker_id === este trabajador, contraparte
                  // correcta) más "todavía no calificado" — el CTA es solo
                  // una entrada visible al RatingForm ya existente en
                  // /jobs/[id]#rating, nunca una segunda implementación del
                  // flujo de calificación (ratings.ts sin cambios).
                  const showRatingCta =
                    app.job?.status === "completado" &&
                    app.job.assigned_worker_id === user.id &&
                    !ratedJobIds.has(app.job.id);
                  return (
                    <div
                      key={app.id}
                      className="-mx-3 flex flex-col gap-2 rounded-2xl px-3 py-3.5 transition-colors duration-200 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Link href={`/jobs/${app.job_id}`} className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{app.job?.title}</p>
                        <p className="text-xs text-ink-muted">
                          {app.job?.category} · {formatCurrency(app.job?.pay_amount ?? null)}{" "}
                          {payTypeLabel(app.job?.pay_type ?? "fijo")}
                        </p>
                      </Link>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {showRatingCta && (
                          <Link
                            href={`/jobs/${app.job_id}#rating`}
                            className="btn-primary !rounded-xl !px-3 !py-1.5 text-xs"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Calificar empleador
                          </Link>
                        )}
                        <Badge tone={jobStatusTone(app.job?.status ?? "")}>
                          {jobStatusLabel(app.job?.status ?? "")}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.15}>
          <section className="card p-6" aria-labelledby="reputacion">
            <h2 id="reputacion" className="flex items-center gap-2 text-base font-bold text-ink">
              <Award className="h-5 w-5 text-primary-500" />
              Mi reputación
            </h2>
            <div className="mt-3 flex items-center gap-2">
              <RatingStars value={Math.round(ratingSummary?.average_score ?? 0)} readOnly />
              <span className="text-sm font-semibold text-ink-muted">
                {ratingSummary ? `${ratingSummary.average_score} / 5` : "Sin calificaciones"}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {ratingSummary?.total_ratings ?? 0} reseñas totales
            </p>

            {recentRatings && recentRatings.length > 0 && (
              <ul className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                {(recentRatings as Rating[]).map((r) => (
                  <li key={r.id} className="text-sm text-ink-muted">
                    <RatingStars value={r.score} readOnly size="sm" />
                    {r.comment && (
                      <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs italic leading-relaxed">
                        “{r.comment}”
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
      </main>
    </div>
  );
}
