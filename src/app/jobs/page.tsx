import { SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JobCard } from "@/components/JobCard";
import { SearchFilters } from "@/components/SearchFilters";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { CATEGORY_NAMES } from "@/lib/categories";
import type { JobWithEmployer } from "@/lib/types";

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
  const typedJobs = (jobs as unknown as JobWithEmployer[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Buscar trabajos
        </h1>
        <p className="mt-1 text-ink-muted">Filtra por ciudad, categoría o palabra clave.</p>
      </Reveal>

      <div className="mt-6">
        <SearchFilters categories={CATEGORY_NAMES} />
      </div>

      <div className="mt-8">
        {error && (
          <EmptyState
            icon={SearchX}
            title="Ocurrió un error"
            description="No pudimos cargar los trabajos. Intenta de nuevo en unos segundos."
          />
        )}
        {!error && typedJobs.length > 0 && (
          <>
            <p className="mb-4 text-sm font-medium text-ink-muted" aria-live="polite">
              {typedJobs.length} {typedJobs.length === 1 ? "trabajo encontrado" : "trabajos encontrados"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {typedJobs.map((job, i) => (
                <Reveal key={job.id} delay={Math.min(i * 0.04, 0.2)}>
                  <JobCard job={job} />
                </Reveal>
              ))}
            </div>
          </>
        )}
        {!error && typedJobs.length === 0 && (
          <EmptyState
            pose="search"
            title="La hormiguita buscó por todos lados..."
            description="No encontramos trabajos con esos filtros. Prueba con otra ciudad o categoría."
            actionLabel="Ver todos los trabajos"
            actionHref="/jobs"
          />
        )}
      </div>
    </div>
  );
}
