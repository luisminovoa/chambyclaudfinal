import { createClient } from "@/lib/supabase/server";
import { JobCard } from "@/components/JobCard";
import { SearchFilters } from "@/components/SearchFilters";
import type { JobWithEmployer } from "@/lib/types";

const CATEGORIES = [
  "Electricista",
  "Gasfitero",
  "Albañil",
  "Niñera",
  "Cocinero/a",
  "Jardinero",
  "Limpieza",
  "Carpintero",
  "Pintor",
  "Chofer",
  "Seguridad",
  "Otro",
];

interface JobsPageProps {
  searchParams: { city?: string; category?: string; q?: string };
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const supabase = createClient();

  let query = supabase
    .from("jobs")
    .select("*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city)")
    .eq("status", "abierto")
    .order("created_at", { ascending: false });

  if (searchParams.city) {
    query = query.ilike("city", `%${searchParams.city}%`);
  }
  if (searchParams.category) {
    query = query.eq("category", searchParams.category);
  }
  if (searchParams.q) {
    query = query.or(`title.ilike.%${searchParams.q}%,description.ilike.%${searchParams.q}%`);
  }

  const { data: jobs, error } = await query;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Buscar trabajos</h1>
      <p className="mt-1 text-slate-500">Filtra por ciudad, categoría o palabra clave.</p>

      <div className="mt-6">
        <SearchFilters categories={CATEGORIES} />
      </div>

      <div className="mt-8">
        {error && <p className="text-red-600">Ocurrió un error al cargar los trabajos.</p>}
        {jobs && jobs.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(jobs as unknown as JobWithEmployer[]).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500">No se encontraron trabajos con esos filtros.</p>
        )}
      </div>
    </div>
  );
}
