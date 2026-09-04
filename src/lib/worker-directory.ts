import { AVAILABILITY_VALUES } from "@/lib/types";
import type {
  AvailabilityStatus,
  WorkerDirectoryFilters,
  PublicWorkerListing,
  RatingSummary,
} from "@/lib/types";

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
  department?: string;
  province?: string;
  district?: string;
}): WorkerDirectoryFilters {
  const availability = AVAILABILITY_VALUES.includes(searchParams.availability as AvailabilityStatus)
    ? (searchParams.availability as AvailabilityStatus)
    : undefined;

  return {
    category: searchParams.category?.trim() || undefined,
    city: searchParams.city?.trim() || undefined,
    availability,
    q: searchParams.q?.trim() || undefined,
    department: searchParams.department?.trim() || undefined,
    province: searchParams.province?.trim() || undefined,
    district: searchParams.district?.trim() || undefined,
  };
}

/**
 * Escapa un valor para usarlo de forma segura dentro de un filtro
 * .or()/.and() de PostgREST (sintaxis "columna.operador.valor" separada
 * por comas dentro de paréntesis). Sin esto, un valor de búsqueda con
 * coma o paréntesis (p.ej. "Juan, electricista" o "Juan (Chiclayo)")
 * rompe la estructura del filtro: PostgREST interpreta la coma como el
 * separador entre condiciones y el resto del texto como el inicio de
 * una nueva condición "columna.operador.valor", no como parte del
 * valor de búsqueda — auditado independientemente, no es inyección SQL
 * (PostgREST nunca concatena el valor en SQL crudo), pero sí puede
 * romper la consulta o alterar qué se compara.
 *
 * Solución (sintaxis documentada de PostgREST para "reserved
 * characters", `,.():"\\`): envolver el valor completo entre comillas
 * dobles y escapar cualquier comilla doble o backslash LITERAL dentro
 * de él. Se envuelve siempre, no solo cuando "parece" necesario —
 * envolver un valor sin caracteres especiales entre comillas dobles
 * sigue siendo sintácticamente válido, así que no hace falta detectar
 * caso por caso qué texto lo requiere.
 */
export function escapePostgrestFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Alias de categoría — el Home (src/lib/categories.ts) usa un catálogo
 * fijo de 12 nombres para las tarjetas "Explora por categoría", pero
 * InfoTab.tsx (edición de perfil del trabajador) usa un catálogo propio
 * y distinto para varias de esas mismas categorías, y RegisterForm.tsx
 * permite texto completamente libre — auditado: "Gasfitero" (Home) vs
 * "Plomero" (InfoTab), "Niñera" vs "Niñera / Cuidador", "Cocinero/a" vs
 * "Cocinero", "Chofer" vs "Conductor". Sin este mapeo, un empleador que
 * hace clic en "Gasfitero" nunca encuentra a un trabajador cuyo
 * `profiles.category` literal es "Plomero", aunque sea exactamente la
 * misma ocupación.
 *
 * Deliberadamente NO se toca el dato almacenado (no hay UPDATE, no hay
 * migración) ni el catálogo visual del Home — el mapeo vive solo aquí,
 * como una capa de lectura. Extensible: agregar una entrada nueva a
 * CATEGORY_ALIASES es suficiente para cubrir un futuro alias sin tocar
 * ninguna otra parte del código.
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  Gasfitero: ["Gasfitero", "Plomero"],
  Niñera: ["Niñera", "Niñera / Cuidador"],
  "Cocinero/a": ["Cocinero/a", "Cocinero"],
  Chofer: ["Chofer", "Conductor"],
  // Catálogo V2 (C1): "Almacenero" fue un valor histórico de profiles.category
  // anterior a la existencia de esta categoría — nunca se convierte en clave
  // canónica ni obtiene su propia entrada aquí, solo se agrega como alias de
  // "Logística y almacén" para que un empleador que filtra por la categoría
  // canónica siga encontrando esos perfiles ya guardados, sin backfill.
  "Logística y almacén": ["Logística y almacén", "Almacenero"],
};

/**
 * Expande una categoría canónica del Home al conjunto de valores reales
 * de `profiles.category`/`public_workers.category` que deben
 * considerarse equivalentes. Sin alias conocido, devuelve solo la
 * categoría tal cual (comportamiento sin cambios para el resto de
 * categorías, p.ej. "Electricista" → ["Electricista"]).
 */
export function expandCategoryAliases(category: string): string[] {
  return CATEGORY_ALIASES[category] ?? [category];
}

/** Tope de puntos que puede aportar el rating promedio (worker sin ratings → 0, nunca negativo). */
const RATING_MAX_POINTS = 30;
/** Tope de puntos que puede aportar jobsCompleted — crece por job, pero se satura para que no domine el ranking. */
const JOBS_COMPLETED_MAX_POINTS = 20;
/** A partir de este número de trabajos completados ya no se suman más puntos (saturación). */
const JOBS_COMPLETED_SATURATION = 10;

/**
 * Puntuación de "preparación del perfil" para ordenar /workers (Fase C3,
 * auditoría C2; extendida en Fase C5 con rating/jobsCompleted — ver
 * auditoría funcional "siguiente prioridad" que documentó ambos como
 * deuda diferida) — determinística, calculada en memoria sobre las filas
 * ya obtenidas de public_workers + rating_summary + conteo de jobs
 * completados, sin ninguna consulta adicional propia de esta función.
 *
 * Pesos base (suman 100), ocupación/ciudad deliberadamente por encima de
 * experiencia/tarifa — SIN CAMBIOS respecto a la Fase C3:
 *   category (30) > city (25) > availability (15) > professional_title (10)
 *   > years_experience (5) = hourly/daily_rate (5) = bio (5) = skills (5)
 *
 * Señales nuevas (Fase C5), sumadas ENCIMA de los 100 puntos base — se
 * amplía la escala en vez de redistribuir los pesos existentes, para no
 * alterar el significado de ningún test/valor ya vigente sobre los 8
 * factores originales:
 *   - rating promedio: hasta RATING_MAX_POINTS (30), proporcional a
 *     average_score/5 (escala real de Rating.score, 1-5). Un worker sin
 *     ratingSummary (nunca calificado todavía) aporta 0 — cold start
 *     explícito, nunca NaN, nunca penalización por debajo de 0.
 *   - jobsCompleted: hasta JOBS_COMPLETED_MAX_POINTS (20), a razón de 2
 *     puntos por job completado, saturado en JOBS_COMPLETED_SATURATION
 *     (10) jobs — así un trabajador con muchísimos jobs no termina
 *     dominando el ranking solo por antigüedad/volumen, y 0 jobs
 *     completados (worker nuevo) aporta 0, el mismo tratamiento neutro
 *     que ya reciben bio/skills ausentes en el esquema original.
 *
 * Máximo teórico actual: 100 + 30 + 20 = 150. average_score se clampea a
 * [0, 5] antes de usarse — un valor corrupto/fuera de rango en
 * rating_summary nunca puede producir un score negativo ni disparado por
 * encima de RATING_MAX_POINTS.
 *
 * NO incluye avatar_url — auditado: handle_new_user() (0006_auth_hardening.sql)
 * copia avatar_url automáticamente desde los metadatos de Google OAuth para
 * cualquier usuario que se registre así, con o sin esfuerzo en su perfil
 * profesional. Usarlo como señal de "perfil preparado" sería engañoso.
 *
 * NO incluye profile_photos(is_primary)/badges — siguen sin estar
 * disponibles en las columnas que expone public_workers; quedan, igual
 * que antes, como candidato a una fase posterior.
 */
export function computeWorkerQualityScore(
  worker: Pick<
    PublicWorkerListing,
    | "category"
    | "city"
    | "availability"
    | "professional_title"
    | "years_experience"
    | "hourly_rate"
    | "daily_rate"
    | "bio"
    | "skills"
  > & {
    /** null/ausente = worker sin ninguna calificación todavía (cold start). */
    ratingSummary?: Pick<RatingSummary, "average_score" | "total_ratings"> | null;
    /** Siempre numérico — 0 si el worker no tiene ningún job completado. */
    jobsCompleted?: number;
  }
): number {
  let score = 0;
  if (worker.category) score += 30;
  if (worker.city) score += 25;
  if (worker.availability) score += 15;
  if (worker.professional_title) score += 10;
  if (worker.years_experience != null) score += 5;
  if (worker.hourly_rate != null || worker.daily_rate != null) score += 5;
  if (worker.bio) score += 5;
  if (worker.skills.length > 0) score += 5;

  if (worker.ratingSummary) {
    const rawAverage = worker.ratingSummary.average_score;
    // Number.isNaN() aparte del clamp: Math.min/Math.max ya clampean
    // correctamente +Infinity->5 y -Infinity->0, pero NaN se propaga a
    // través de ambos (Math.min(5, NaN) es NaN) — un average_score
    // literalmente NaN (nunca producido por AVG() de Postgres, que
    // devuelve NULL o un numeric válido, pero technically representable
    // en el tipo `number` de TypeScript) debe tratarse como "sin bono",
    // igual que ratingSummary ausente.
    const clampedAverage = Number.isNaN(rawAverage) ? 0 : Math.max(0, Math.min(5, rawAverage));
    score += (clampedAverage / 5) * RATING_MAX_POINTS;
  }

  const jobsCompleted = worker.jobsCompleted ?? 0;
  const cappedJobs = Math.max(0, Math.min(jobsCompleted, JOBS_COMPLETED_SATURATION));
  score += (cappedJobs / JOBS_COMPLETED_SATURATION) * JOBS_COMPLETED_MAX_POINTS;

  return score;
}
