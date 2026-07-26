import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { RatingStars } from "@/components/RatingStars";
import {
  formatCurrency,
  payTypeLabel,
  jobStatusColor,
  jobStatusLabel,
  applicationStatusLabel,
  formatDate,
} from "@/lib/utils";
import type { ApplicationWithProfiles, RatingSummary, Rating } from "@/lib/types";

export default async function WorkerDashboardPage() {
  const supabase = createClient();
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile && profile.role === "employer") redirect("/dashboard/employer");
  if (profile && profile.role === "admin") redirect("/admin");

  const { data: applications } = await supabase
    .from("job_applications")
    .select("*, job:jobs(*)")
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });

  const typedApps = (applications as unknown as ApplicationWithProfiles[]) ?? [];
  const activeApps = typedApps.filter((a) => a.job && a.job.status !== "completado" && a.job.status !== "cancelado");
  const history = typedApps.filter(
    (a) => a.status === "aceptado" && a.job && (a.job.status === "completado" || a.job.status === "en_progreso")
  );

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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hola, {profile?.full_name.split(" ")[0]}</h1>
          <p className="mt-1 text-slate-500">Este es tu panel de trabajador.</p>
        </div>
        <Link href="/jobs" className="btn-primary">
          Buscar trabajos
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold text-slate-900">Postulaciones activas</h2>
            {activeApps.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No tienes postulaciones activas.{" "}
                <Link href="/jobs" className="font-medium text-primary-700 hover:underline">
                  Explora trabajos disponibles
                </Link>
                .
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {activeApps.map((app) => (
                  <Link
                    key={app.id}
                    href={`/jobs/${app.job_id}`}
                    className="flex items-center justify-between py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{app.job?.title}</p>
                      <p className="text-xs text-slate-500">
                        {app.job?.city} · Postulaste el {formatDate(app.created_at)}
                      </p>
                    </div>
                    <span className="badge bg-slate-100 text-slate-600">
                      {applicationStatusLabel(app.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-semibold text-slate-900">Historial laboral</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Aún no tienes trabajos en tu historial.</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {history.map((app) => (
                  <Link
                    key={app.id}
                    href={`/jobs/${app.job_id}`}
                    className="flex items-center justify-between py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{app.job?.title}</p>
                      <p className="text-xs text-slate-500">
                        {app.job?.category} · {formatCurrency(app.job?.pay_amount ?? null)}{" "}
                        {payTypeLabel(app.job?.pay_type ?? "fijo")}
                      </p>
                    </div>
                    <span className={`badge ${jobStatusColor(app.job?.status ?? "")}`}>
                      {jobStatusLabel(app.job?.status ?? "")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold text-slate-900">Mi reputación</h2>
            <div className="mt-3 flex items-center gap-2">
              <RatingStars value={Math.round(ratingSummary?.average_score ?? 0)} readOnly />
              <span className="text-sm text-slate-500">
                {ratingSummary ? `${ratingSummary.average_score} / 5` : "Sin calificaciones"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {ratingSummary?.total_ratings ?? 0} reseñas totales
            </p>

            {recentRatings && recentRatings.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {(recentRatings as Rating[]).map((r) => (
                  <li key={r.id} className="text-sm text-slate-600">
                    <RatingStars value={r.score} readOnly size="sm" />
                    {r.comment && <p className="mt-1 italic text-slate-500">“{r.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-semibold text-slate-900">Mi perfil</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-400">Ciudad</dt>
                <dd className="text-slate-700">{profile?.city ?? "No especificada"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Puesto principal</dt>
                <dd className="text-slate-700">{profile?.category ?? "No especificado"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
