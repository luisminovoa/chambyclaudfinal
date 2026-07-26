import { Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminJobRow } from "@/components/AdminJobRow";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Job } from "@/lib/types";

export default async function AdminJobsPage() {
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });
  const typedJobs = (jobs as Job[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Trabajos</h1>
        <p className="mt-1 text-ink-muted">Modera las publicaciones de la plataforma.</p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="card mt-6 overflow-x-auto p-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 font-semibold">Trabajo</th>
                <th className="pb-3 font-semibold">Estado</th>
                <th className="pb-3 font-semibold">Publicado</th>
                <th className="pb-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {typedJobs.map((job) => (
                <AdminJobRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
          {typedJobs.length === 0 && (
            <EmptyState
              icon={Briefcase}
              title="No hay trabajos publicados"
              description="Las publicaciones de los empleadores aparecerán aquí para su moderación."
            />
          )}
        </div>
      </Reveal>
    </div>
  );
}
