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
