import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Convierte un PostgrestError en un mensaje específico y accionable para el
 * usuario, sin ocultar nunca el mensaje/hint original de Postgres — el
 * mensaje devuelto SIEMPRE incluye el texto real del error, precedido de una
 * categoría cuando se puede identificar una causa conocida (tabla
 * inexistente, RLS, campo obligatorio, etc.).
 *
 * También loguea el error completo (incluye `hint`, que suele traer la
 * corrección exacta de Postgres) en la consola del servidor — visible en
 * `npm run dev` y en los logs de producción.
 */
export function formatSupabaseError(error: PostgrestError, context: string): string {
  console.error(`[${context}]`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });

  const code = error.code;
  const msg = error.message;
  const detail = error.hint || error.details || msg;

  // 42P01 = undefined_table: falta aplicar una migración
  if (code === "42P01") {
    return `La tabla referenciada no existe en la base de datos — probablemente falta aplicar una migración. Detalle: ${msg}`;
  }

  // 42501 / mensaje de RLS = permiso denegado por policy
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return `Error de permisos (RLS): ${detail}`;
  }

  // 23502 = not_null_violation: falta un campo obligatorio
  if (code === "23502") {
    return `Falta un campo obligatorio. Detalle: ${detail}`;
  }

  // 23503 = foreign_key_violation
  if (code === "23503") {
    return `Referencia inválida (clave foránea). Detalle: ${detail}`;
  }

  // 23505 = unique_violation
  if (code === "23505") {
    return `Ya existe un registro con ese valor. Detalle: ${detail}`;
  }

  // 23514 / 22xxx = check_violation / data_exception (rango, formato de fecha, etc.)
  if (code === "23514" || code?.startsWith("22")) {
    return `Valor inválido o fuera de rango permitido. Detalle: ${detail}`;
  }

  // Sin código (fetch falló antes de llegar a Postgres) = problema de red/conexión
  if (!code) {
    return `Error al conectar con Supabase: ${msg}`;
  }

  return `Error (${code}): ${detail}`;
}

/**
 * Para el caso en que el propio cliente de Supabase lanza una excepción en
 * vez de resolver con `{ error }` — ocurre en fallas de red/DNS/timeout
 * antes de llegar a Postgres (ver @supabase/postgrest-js, reintentos
 * agotados o AbortError). Sin este catch, esas fallas se propagan como una
 * excepción no capturada del Server Action y Next.js las reemplaza por un
 * "Application error: a server-side exception has occurred" completamente
 * opaco — el mismo problema que formatSupabaseError() resuelve para errores
 * de Postgres, pero un nivel más abajo.
 */
export function formatUnknownError(err: unknown, context: string): string {
  console.error(`[${context}] excepción no capturada por Supabase:`, err);

  const message = err instanceof Error ? err.message : String(err);
  return `Error al conectar con Supabase: ${message}`;
}
