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
import {
  formatCurrency,
  payTypeLabel,
  jobStatusLabel,
  applicationStatusLabel,
  formatDate,
} from "@/lib/utils";
import { RoleSwitcher } from "@/components/roles/RoleSwitcher";
import type { ApplicationWithProfiles, RatingSummary, Rating } from "@/lib/types";

export default async function WorkerDashboardPage() {
  const supabase = createClient();
  const { user, profile, userRoles } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile && profile.role === "employer") redirect("/dashboard/employer");
  if (profile && profile.role === "admin") redirect("/admin");

  const { data: applications } = await supabase
    .from("job_applications")
    .select("*, job:jobs(*)")
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {userRoles.length > 1 && (
        <RoleSwitcher
          activeRole={profile?.role ?? "worker"}
          availableRoles={userRoles}
          variant="card"
        />
      )}

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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Reveal>
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
                    <Link
                      key={app.id}
                      href={`/jobs/${app.job_id}`}
                      className="-mx-3 flex items-center justify-between gap-3 rounded-2xl px-3 py-3.5 transition-colors duration-200 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{app.job?.title}</p>
                        <p className="flex items-center gap-1 text-xs text-ink-muted">
                          <MapPin className="h-3 w-3" />
                          {app.job?.city} · Postulaste el {formatDate(app.created_at)}
                        </p>
                      </div>
                      <Badge tone={jobStatusTone(app.status)} className="shrink-0">
                        {applicationStatusLabel(app.status)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.05}>
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
                  {history.map((app) => (
                    <Link
                      key={app.id}
                      href={`/jobs/${app.job_id}`}
                      className="-mx-3 flex items-center justify-between gap-3 rounded-2xl px-3 py-3.5 transition-colors duration-200 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{app.job?.title}</p>
                        <p className="text-xs text-ink-muted">
                          {app.job?.category} · {formatCurrency(app.job?.pay_amount ?? null)}{" "}
                          {payTypeLabel(app.job?.pay_type ?? "fijo")}
                        </p>
                      </div>
                      <Badge tone={jobStatusTone(app.job?.status ?? "")} className="shrink-0">
                        {jobStatusLabel(app.job?.status ?? "")}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        </div>

        <aside className="space-y-6">
          <Reveal delay={0.1}>
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

          <Reveal delay={0.15}>
            <section className="card p-6" aria-labelledby="mi-perfil">
              <h2 id="mi-perfil" className="text-base font-bold text-ink">
                Mi perfil
              </h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">Ciudad</dt>
                  <dd className="font-semibold text-ink">{profile?.city ?? "No especificada"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">Puesto principal</dt>
                  <dd className="font-semibold text-ink">{profile?.category ?? "No especificado"}</dd>
                </div>
              </dl>
              {profile?.skills && profile.skills.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Habilidades
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((skill) => (
                      <Badge key={skill} tone="primary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <Link
                  href="/dashboard/worker/profile"
                  className="btn-secondary w-full justify-center"
                >
                  Editar perfil profesional
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="btn-ghost w-full justify-center text-sm"
                >
                  Configuración
                </Link>
              </div>
            </section>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}
