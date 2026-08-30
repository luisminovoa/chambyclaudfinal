import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { listPublicWorkers } from "@/lib/actions/workers";
import { parseWorkerDirectorySearchParams } from "@/lib/worker-directory";
import { WorkerSearchFilters } from "@/components/workers/WorkerSearchFilters";
import { WorkerDirectoryCard } from "@/components/workers/WorkerDirectoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { CATEGORY_NAMES } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Buscar trabajadores",
  description: "Encuentra trabajadores activos por categoría, ciudad y disponibilidad para tu próxima chamba.",
};

interface WorkersPageProps {
  searchParams: {
    category?: string;
    city?: string;
    availability?: string;
    q?: string;
    department?: string;
    province?: string;
    district?: string;
  };
}

/**
 * Directorio de trabajadores (Fase 3) — pensado primero para empleadores,
 * pero sin restringir por rol más allá de exigir sesión: public_workers
 * (0037_public_workers_directory.sql) otorga SELECT a `authenticated` en
 * general, no solo a empleadores, así que esta página no inventa una
 * restricción adicional que la vista no impone. Abrir el perfil
 * individual de un trabajador (/workers/[workerId]) sigue gateado por
 * canViewWorkerProfile() (Fase 2, sin cambios): un worker que navegue
 * hasta aquí puede ver la lista (datos ya públicos, sin PII), pero si
 * hace clic en otro worker sin relación previa seguirá recibiendo el
 * EmptyState de "no disponible" — la autorización real vive ahí, no en
 * esta página.
 */
export default async function WorkersPage({ searchParams }: WorkersPageProps) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => Boolean(v)) as [string, string][]
    ).toString();
    redirect(`/login?next=${encodeURIComponent(`/workers${qs ? `?${qs}` : ""}`)}`);
  }

  const filters = parseWorkerDirectorySearchParams(searchParams);
  const workers = await listPublicWorkers(filters);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Encuentra trabajadores
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted sm:text-base">
          Filtra por categoría, ciudad y disponibilidad, o busca por nombre y especialidad.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-6">
        <WorkerSearchFilters categories={CATEGORY_NAMES} />
      </Reveal>

      <div className="mt-6">
        {workers.length > 0 ? (
          <>
            <Reveal>
              <p className="mb-4 text-sm font-semibold text-ink-muted">
                {workers.length} {workers.length === 1 ? "trabajador encontrado" : "trabajadores encontrados"}
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workers.map((worker, i) => (
                <Reveal key={worker.id} delay={Math.min(i * 0.05, 0.25)}>
                  <WorkerDirectoryCard worker={worker} />
                </Reveal>
              ))}
            </div>
          </>
        ) : (
          <Reveal>
            <EmptyState
              pose="search"
              title="No encontramos trabajadores con esos filtros"
              description="Prueba con otra categoría, ciudad o disponibilidad, o limpia los filtros para ver a todos los trabajadores activos."
              actionLabel="Ver todos los trabajadores"
              actionHref="/workers"
            />
          </Reveal>
        )}
      </div>
    </div>
  );
}
