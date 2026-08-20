import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Briefcase, Loader2, CheckCircle2, Users, Award, MapPin, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getProfilePhotos } from "@/lib/actions/profile";
import { RatingStars } from "@/components/RatingStars";
import { EmployerJobRow } from "@/components/EmployerJobRow";
import { Avatar } from "@/components/ui/Avatar";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackToWorkerButton } from "@/components/roles/BackToWorkerButton";
import type { Job, ProfilePhoto, RatingSummary } from "@/lib/types";

export default async function EmployerDashboardPage() {
  const supabase = createClient();
  const { user, profile, userRoles } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile && profile.role === "worker") redirect("/dashboard/worker");
  if (profile && profile.role === "admin") redirect("/admin");

  const [{ data: jobs }, photos] = await Promise.all([
    supabase
      .from("jobs")
      .select("*")
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false }),
    getProfilePhotos(),
  ]);

  const primaryPhoto = (photos as ProfilePhoto[]).find((p) => p.is_primary) ?? null;
  const avatarSrc = primaryPhoto?.public_url ?? profile?.avatar_url ?? null;

  const typedJobs = (jobs as Job[]) ?? [];

  const { data: applicationCounts } = await supabase
    .from("job_applications")
    .select("job_id")
    .in(
      "job_id",
      typedJobs.map((j) => j.id).length
        ? typedJobs.map((j) => j.id)
        : ["00000000-0000-0000-0000-000000000000"]
    );

  const countByJob: Record<string, number> = {};
  (applicationCounts ?? []).forEach((a: { job_id: string }) => {
    countByJob[a.job_id] = (countByJob[a.job_id] ?? 0) + 1;
  });

  const { data: ratingSummaryRaw } = await supabase
    .from("rating_summary")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const ratingSummary = ratingSummaryRaw as unknown as RatingSummary | null;

  const openCount = typedJobs.filter((j) => j.status === "abierto").length;
  const inProgressCount = typedJobs.filter((j) => j.status === "en_progreso").length;
  const completedCount = typedJobs.filter((j) => j.status === "completado").length;
  const totalApplicants = Object.values(countByJob).reduce((acc, n) => acc + n, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        {userRoles.includes("worker") && (
          <div className="mb-4">
            <BackToWorkerButton />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              Hola, {profile?.full_name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1 text-ink-muted">Gestiona tus publicaciones y postulantes.</p>
          </div>
          <Link href="/jobs/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            Publicar trabajo
          </Link>
        </div>
      </Reveal>

      {/* Perfil */}
      <Reveal delay={0.03}>
        <div className="mt-6 card flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
          <Avatar name={profile?.full_name ?? ""} src={avatarSrc} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink">{profile?.full_name}</p>
            {profile?.city && (
              <p className="flex items-center justify-center gap-1 text-xs text-ink-muted sm:justify-start">
                <MapPin className="h-3 w-3 shrink-0" />
                {profile.city}
              </p>
            )}
            <p className="mt-0.5 text-xs text-ink-muted">
              Así te ven los trabajadores en tu perfil público
            </p>
          </div>
          <Link
            href="/dashboard/employer/profile"
            className="btn-secondary w-full shrink-0 justify-center gap-1.5 sm:w-auto"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar perfil
          </Link>
        </div>
      </Reveal>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal>
          <StatCard icon={Briefcase} label="Abiertos" value={openCount} />
        </Reveal>
        <Reveal delay={0.05}>
          <StatCard icon={Loader2} label="En progreso" value={inProgressCount} tone="warning" />
        </Reveal>
        <Reveal delay={0.1}>
          <StatCard icon={CheckCircle2} label="Completados" value={completedCount} tone="success" />
        </Reveal>
        <Reveal delay={0.15}>
          {/* Único KPI accionable: abre la vista agregada de postulantes.
              Hasta ahora la tarjeta parecía interactiva (card-hover) pero
              no navegaba a ningún sitio. */}
          <Link
            href="/dashboard/employer/applicants"
            className="block rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            <StatCard
              icon={Users}
              label="Postulantes"
              value={totalApplicants}
              tone="neutral"
              hint="Ver todos"
            />
          </Link>
        </Reveal>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <section className="card p-6" aria-labelledby="mis-publicaciones">
            <h2 id="mis-publicaciones" className="text-base font-bold text-ink">
              Mis publicaciones
            </h2>
            {typedJobs.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  pose="briefcase"
                  title="La hormiguita todavía no encontró ninguna chamba"
                  description="Publica tu primera vacante y empieza a recibir postulaciones hoy mismo."
                  actionLabel="Publicar la primera"
                  actionHref="/jobs/new"
                />
              </div>
            ) : (
              <div className="mt-2">
                {typedJobs.map((job) => (
                  <EmployerJobRow key={job.id} job={job} applicantsCount={countByJob[job.id] ?? 0} />
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <aside className="card p-6" aria-labelledby="reputacion-empleador">
            <h2 id="reputacion-empleador" className="flex items-center gap-2 text-base font-bold text-ink">
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
          </aside>
        </Reveal>
      </div>
    </div>
  );
}
