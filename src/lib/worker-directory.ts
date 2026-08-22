import { AVAILABILITY_VALUES } from "@/lib/types";
import type { AvailabilityStatus, WorkerDirectoryFilters } from "@/lib/types";

/**
 * Normaliza los searchParams crudos de /workers (strings arbitrarias de
 * la URL, potencialmente ausentes/vacías/inválidas) a WorkerDirectoryFilters
 * antes de pasarlas a listPublicWorkers() (src/lib/actions/workers.ts).
 * Función pura, separada del Server Component de la página para poder
 * probarla sin renderizar nada — mismo patrón que canViewWorkerProfile()
 * (src/lib/worker-profile-access.ts).
 *
 * `availability` se valida contra AVAILABILITY_VALUES (el enum real) en
 * vez de pasarse tal cual: un valor fuera del enum nunca debe llegar a
 * `.eq("availability", ...)` — no es un riesgo de seguridad (public_workers
 * ya no tiene columnas sensibles que filtrar), pero evita depender del
 * comportamiento de Postgres ante un cast de enum inválido.
 */
export function parseWorkerDirectorySearchParams(searchParams: {
  category?: string;
  city?: string;
  availability?: string;
  q?: string;
}): WorkerDirectoryFilters {
  const availability = AVAILABILITY_VALUES.includes(searchParams.availability as AvailabilityStatus)
    ? (searchParams.availability as AvailabilityStatus)
    : undefined;

  return {
    category: searchParams.category?.trim() || undefined,
    city: searchParams.city?.trim() || undefined,
    availability,
    q: searchParams.q?.trim() || undefined,
  };
}
