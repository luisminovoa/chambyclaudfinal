import { AVAILABILITY_VALUES } from "@/lib/types";
import type { AvailabilityStatus, WorkerDirectoryFilters, PublicWorkerListing } from "@/lib/types";

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

/**
 * Puntuación de "preparación del perfil" para ordenar /workers (Fase C3,
 * auditoría C2) — determinística, calculada en memoria sobre las filas ya
 * obtenidas de public_workers, sin ninguna consulta adicional. Objetivo
 * acotado a propósito: "entre los que coinciden con mi búsqueda, ¿cuál
 * tiene el perfil más preparado?", NO un ranking general de "mejor
 * trabajador" (eso implicaría rating/jobsCompleted/badges — fuera de
 * alcance, ver nota abajo).
 *
 * Pesos (suman 100), ocupación/ciudad deliberadamente por encima de
 * experiencia/tarifa:
 *   category (30) > city (25) > availability (15) > professional_title (10)
 *   > years_experience (5) = hourly/daily_rate (5) = bio (5) = skills (5)
 *
 * NO incluye avatar_url — auditado: handle_new_user() (0006_auth_hardening.sql)
 * copia avatar_url automáticamente desde los metadatos de Google OAuth para
 * cualquier usuario que se registre así, con o sin esfuerzo en su perfil
 * profesional. Usarlo como señal de "perfil preparado" sería engañoso.
 *
 * NO incluye rating/jobsCompleted/profile_photos(is_primary)/badges —
 * requieren una consulta adicional (rating_summary/profile_photos ya
 * separadas del fetch principal) o no están disponibles en absoluto en
 * las columnas que expone public_workers; incorporarlos queda documentado
 * como candidato a una fase posterior (C4/C5), no como parte de este MVP.
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
  >
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
  return score;
}
