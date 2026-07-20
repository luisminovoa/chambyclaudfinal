import { createClient } from "@/lib/supabase/server";
import { AdminJobRow } from "@/components/AdminJobRow";
import type { Job } from "@/lib/types";

export default async function AdminJobsPage() {
  const supabase = createClient();
  const { data: jobs } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
  const typedJobs = (jobs as Job[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Trabajos</h1>
      <p className="mt-1 text-slate-500">Modera las publicaciones de la plataforma.</p>

      <div className="mt-6 card overflow-x-auto p-6">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <th className="pb-2 font-medium">Trabajo</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 font-medium">Publicado</th>
              <th className="pb-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {typedJobs.map((job) => (
              <AdminJobRow key={job.id} job={job} />
            ))}
          </tbody>
        </table>
        {typedJobs.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No hay trabajos publicados.</p>
        )}
      </div>
    </div>
  );
}
