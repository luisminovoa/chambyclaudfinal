/**
 * Fuente única de verdad del catálogo de ciudades — mismo patrón que
 * CATEGORY_NAMES (src/lib/categories.ts). Catálogo V1 (Fase C4-C),
 * construido exclusivamente a partir de los valores reales de
 * profiles.city para perfiles activos en Production (auditoría C4-B):
 * únicamente "Chiclayo" (worker) y "Trujillo"/"CHICLAYO" (employer)
 * aparecen hoy — "CHICLAYO" es la misma ciudad que "Chiclayo", no una
 * ciudad adicional. No se agregó ninguna otra ciudad conocida del Perú
 * sin evidencia real de uso.
 *
 * Deliberadamente sin iconos ni región: a diferencia de CATEGORIES, no
 * hay ningún consumidor que necesite más que el nombre.
 */
export const CITIES = ["Chiclayo", "Trujillo"] as const;

export const CITY_NAMES = [...CITIES];

/**
 * Normaliza un valor histórico de `profiles.city` a su forma canónica del
 * catálogo (Fase C4-D) — solo en memoria, para que un `<select>`
 * controlado pueda mostrar la opción correcta como seleccionada aunque el
 * dato en BD no coincida en mayúsculas/espacios (p. ej. "CHICLAYO" o
 * " chiclayo "). Nunca escribe en BD ni dispara ninguna acción — es pura
 * lectura, llamada únicamente al inicializar el estado local del `<select>`.
 *
 * Deliberadamente NO usa una tabla de alias separada (`CITY_ALIASES`) que
 * duplicaría CITY_NAMES y podría desincronizarse de él — compara contra el
 * propio catálogo de forma case-insensitive, así que cualquier ciudad que
 * se agregue a CITIES en el futuro queda cubierta automáticamente.
 *
 * Un valor que no coincide con ninguna ciudad del catálogo (incluida
 * cualquier variante de mayúsculas/espacios) se devuelve tal cual — nunca
 * se inventa ni se fuerza a otra ciudad del catálogo.
 */
export function normalizeCity(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const canonical = CITY_NAMES.find((name) => name.toLowerCase() === trimmed.toLowerCase());
  return canonical ?? value;
}
