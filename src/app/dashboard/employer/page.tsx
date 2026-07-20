import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { RatingStars } from "@/components/RatingStars";
import { EmployerJobRow } from "@/components/EmployerJobRow";
import type { Job } from "@/lib/types";

export default async function EmployerDashboardPage() {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile && profile.role === "worker") redirect("/dashboard/worker");
  if (profile && profile.role === "admin") redirect("/admin");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false });

  const typedJobs = (jobs as Job[]) ?? [];

  const { data: applicationCounts } = await supabase
    .from("job_applications")
    .select("job_id")
    .in("job_id", typedJobs.map((j) => j.id).length ? typedJobs.map((j) => j.id) : ["00000000-0000-0000-0000-000000000000"]);

  const countByJob: Record<string, number> = {};
  (applicationCounts ?? []).forEach((a: { job_id: string }) => {
    countByJob[a.job_id] = (countByJob[a.job_id] ?? 0) + 1;
  });

  const { data: ratingSummary } = await supabase
    .from("rating_summary")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  const openCount = typedJobs.filter((j) => j.status === "abierto").length;
  const inProgressCount = typedJobs.filter((j) => j.status === "en_progreso").length;
  const completedCount = typedJobs.filter((j) => j.status === "completado").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hola, {profile?.full_name.split(" ")[0]}</h1>
          <p className="mt-1 text-slate-500">Gestiona tus publicaciones y postulantes.</p>
        </div>
        <Link href="/jobs/new" className="btn-primary">
          Publicar trabajo
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase text-slate-400">Abiertos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{openCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase text-slate-400">En progreso</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{inProgressCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase text-slate-400">Completados</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{completedCount}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Mis publicaciones</h2>
          {typedJobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Aún no has publicado trabajos.{" "}
              <Link href="/jobs/new" className="font-medium text-primary-700 hover:underline">
                Publica el primero
              </Link>
              .
            </p>
          ) : (
            <div className="mt-4">
              {typedJobs.map((job) => (
                <EmployerJobRow key={job.id} job={job} applicantsCount={countByJob[job.id] ?? 0} />
              ))}
            </div>
          )}
        </section>

        <aside className="card p-6">
          <h2 className="font-semibold text-slate-900">Mi reputación</h2>
          <div className="mt-3 flex items-center gap-2">
            <RatingStars value={Math.round(ratingSummary?.average_score ?? 0)} readOnly />
            <span className="text-sm text-slate-500">
              {ratingSummary ? `${ratingSummary.average_score} / 5` : "Sin calificaciones"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{ratingSummary?.total_ratings ?? 0} reseñas totales</p>
        </aside>
      </div>
    </div>
  );
}
