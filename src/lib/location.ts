import type { NormalizedLocation } from "@/lib/ubigeo";

/**
 * Módulo compartido de lógica pura de ubicación — SIN "use server" ni
 * "use client": debe poder importarse tanto desde Server Actions
 * (src/lib/actions/auth.ts) como, en el futuro, desde Client Components,
 * sin arrastrar restricciones de ninguno de los dos mundos.
 *
 * Fase C4-G9.2.3.5: deriveRegisterCity() vivía originalmente exportada
 * desde src/lib/actions/auth.ts (Fase C4-G9.2.3.1/3.3), pero ese archivo
 * tiene "use server" a nivel de archivo completo — Next.js exige que
 * TODO export de nivel superior de un archivo así sea una Server Action
 * async, y esta es una función pura síncrona. Eso rompía `next build`
 * ("Server actions must be async functions"), sin que tsc/lint/vitest lo
 * detectaran (ninguno de los tres aplica esa regla). Se mueve aquí sin
 * cambiar su comportamiento — auth.ts pasa a importarla en vez de
 * definirla.
 */

/**
 * Deriva `city` (columna nullable en profiles, leída por el resto de la
 * app — NO es NOT NULL, así que una cadena vacía es un valor válido y
 * deliberado, no un error) para el registro por email/contraseña.
 *
 * Prioridad: si el caller envió `department` (señal de que interactuó con
 * la ubicación jerárquica, aunque sea parcialmente), la ubicación nueva
 * manda por completo — `district || province || ""` — incluso si eso da
 * una cadena vacía (solo departamento, sin provincia todavía: NUNCA se
 * inventa un valor a partir de la city histórica en ese caso). Si NO se
 * envió ningún `department`, se conserva íntegra la `city` histórica que
 * ya manda RegisterForm.tsx (compatibilidad total con el formulario
 * actual) — incluida una `city` histórica vacía si tampoco se envió
 * (ambas fuentes ausentes ⇒ resultado "", aceptado explícitamente, no
 * rechazado). Mismo criterio de derivación (`district || province`) ya
 * usado en RoleOnboardingForm.tsx/InfoTab.tsx/NewJobForm.tsx — no se
 * reinventa la lógica, solo se decide cuál de las dos fuentes (ubicación
 * nueva vs. city histórica) tiene prioridad en este flujo concreto, que
 * es el único que todavía combina ambas.
 */
export function deriveRegisterCity(location: NormalizedLocation, historicalCity: string): string {
  if (location.department) {
    return location.district || location.province || "";
  }
  return historicalCity;
}

/** Entrada aceptada por formatLocation() — cualquier fila que tenga estas
 * cuatro columnas (Profile, Job, PublicProfileView, PublicWorkerListing,
 * WorkerDiscoveryProfile, ...) sirve tal cual, sin adaptar. */
export interface LocationDisplayInput {
  department?: string | null;
  province?: string | null;
  district?: string | null;
  city?: string | null;
}

/**
 * Fase 6 (C4-G18): única fuente de presentación de ubicación jerárquica
 * en toda la app — búsqueda de trabajadores/chambas, resultados, perfil
 * público de trabajador/empleador y detalle de trabajo usan esta misma
 * función, nunca `worker.city`/`job.city` directamente ni un fallback
 * duplicado en el propio componente.
 *
 * Reglas (más específico primero, en orden fijo distrito → provincia →
 * departamento, uniendo solo los niveles realmente presentes):
 *   department + province + district → "Distrito, Provincia, Departamento"
 *   province + department (sin distrito) → "Provincia, Departamento"
 *   solo department → "Departamento"
 *   cualquier combinación parcial → se unen solo los niveles presentes,
 *     en ese mismo orden fijo, sin inventar el nivel faltante
 *   ningún nivel de Ubigeo presente + city → city (fallback legacy)
 *   nada presente → null
 *
 * Deliberadamente NUNCA infiere Ubigeo a partir de `city` (p. ej.
 * "Chiclayo" → "Lambayeque"): si no hay ningún nivel jerárquico, se
 * devuelve `city` tal cual, sin intentar mapearla a departamento/
 * provincia. Strings vacíos o solo espacios se tratan como ausentes
 * (mismo criterio de trim que validateLocationInput en ubigeo.ts).
 */
export function formatLocation(location: LocationDisplayInput): string | null {
  const department = location.department?.trim() || null;
  const province = location.province?.trim() || null;
  const district = location.district?.trim() || null;
  const city = location.city?.trim() || null;

  const hierarchical = [district, province, department].filter(
    (level): level is string => level !== null
  );
  if (hierarchical.length > 0) return hierarchical.join(", ");

  return city;
}
