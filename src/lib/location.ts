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
