import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JobCard } from "@/components/JobCard";
import type { JobWithEmployer } from "@/lib/types";

export default async function HomePage() {
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city)")
    .eq("status", "abierto")
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <div>
      <section className="bg-gradient-to-b from-primary-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h1 className="mx-auto max-w-2xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Encuentra tu próxima <span className="text-primary-600">chamba</span>, o al talento
            que necesitas
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Chamby conecta trabajadores y empleadores por ciudad y puesto, con historial laboral
            y calificaciones reales.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/jobs" className="btn-primary !px-6 !py-3 text-base">
              Buscar trabajos
            </Link>
            <Link href="/register" className="btn-secondary !px-6 !py-3 text-base">
              Publicar un trabajo
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Trabajos recientes</h2>
          <Link href="/jobs" className="text-sm font-medium text-primary-700 hover:underline">
            Ver todos →
          </Link>
        </div>

        {jobs && jobs.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(jobs as unknown as JobWithEmployer[]).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500">Aún no hay trabajos publicados. ¡Sé el primero!</p>
        )}
      </section>

      <section className="bg-slate-900">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 text-white sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-3xl font-bold text-accent-500">1.</p>
            <h3 className="mt-2 text-lg font-semibold">Crea tu perfil</h3>
            <p className="mt-1 text-sm text-slate-300">
              Regístrate como trabajador o empleador en menos de un minuto.
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-accent-500">2.</p>
            <h3 className="mt-2 text-lg font-semibold">Busca o publica</h3>
            <p className="mt-1 text-sm text-slate-300">
              Filtra por ciudad y puesto, o publica tu vacante en segundos.
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-accent-500">3.</p>
            <h3 className="mt-2 text-lg font-semibold">Trabaja y califica</h3>
            <p className="mt-1 text-sm text-slate-300">
              Construye tu historial laboral y reputación con cada chamba.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
