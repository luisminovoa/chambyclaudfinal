// FASE P1-B2.2 — lógica pura de la Edge Function `send-push`.
//
// Sin dependencias de Deno, sin `fetch`, sin nada de red — solo
// TypeScript estándar, para poder probarla con vitest (Node) en un
// entorno que no tiene el runtime Deno instalado. `index.ts` (el
// entrypoint real de la Edge Function) importa este archivo.

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  job_id: string | null;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  jobId: string | null;
}

/** Único tipo de notification en alcance para Web Push en esta fase — ver P1-B2.1. */
export const REMINDER_TYPE = "reminder";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Extrae ÚNICAMENTE `notification_id` de un body ya parseado como JSON.
 * Cualquier otro campo (user_id, job_id, title, body, subscriptions...)
 * se descarta estructuralmente aquí — nunca llega más allá de esta
 * función hacia el resto de la Edge Function. Esto es lo que hace que
 * "el request intenta enviar un user_id distinto" sea, por diseño,
 * imposible de que tenga ningún efecto: ese campo nunca se lee.
 */
export function extractNotificationId(rawBody: unknown): unknown {
  if (!rawBody || typeof rawBody !== "object") return undefined;
  return (rawBody as Record<string, unknown>).notification_id;
}

/**
 * Compara dos secretos evitando el corte en el primer carácter distinto
 * de un `===` directo. Defensa en profundidad razonable por defecto — el
 * secreto solo viaja entre Postgres (vía pg_net) y esta función, nunca
 * expuesto a un cliente en condiciones de medir latencia con precisión.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Payload mínimo que viaja al navegador (ver Privacidad, diseño P1-B2.1):
 * nunca `user_id`, nunca PII, nunca las claves de la subscription. `jobId`
 * prioriza `data.jobId` (como ya hace la notification de 0056) y cae a
 * `job_id` de la columna directa, luego a `null`.
 */
export function buildPushPayload(notification: NotificationRow): PushPayload {
  const dataJobId =
    notification.data && typeof notification.data.jobId === "string" ? notification.data.jobId : null;
  return {
    title: notification.title ?? "Chamby",
    body: notification.body ?? "Tienes una notificación nueva.",
    jobId: dataJobId ?? notification.job_id ?? null,
  };
}

/** 404/410 del push service = subscription inválida/expirada. Cualquier otro código no lo es. */
export function shouldRemoveSubscription(status: number): boolean {
  return status === 404 || status === 410;
}

/**
 * FASE P1-B2.5 — idempotencia del despacho. `index.ts` marca
 * `notifications.push_dispatched_at` con un UPDATE condicional
 * (`WHERE push_dispatched_at IS NULL RETURNING id`) ANTES de leer
 * `push_subscriptions` o enviar ningún push. Si esa actualización no
 * devuelve ninguna fila, significa que otra invocación (p.ej. un
 * reintento de transporte de `pg_net`) ya la marcó primero — esta
 * llamada debe cortar ahí, sin reenviar nada, con éxito no-op.
 */
export function wasAlreadyDispatched(updatedRows: unknown[] | null): boolean {
  return !updatedRows || updatedRows.length === 0;
}

/**
 * FASE P1-B2.5.1 — decide si, tras intentar los envíos, el claim de
 * `push_dispatched_at` debe liberarse (poner en `NULL`) para permitir un
 * reintento futuro. Regla de v1, deliberadamente simple: CUALQUIER falla
 * (total o parcial — incluso 1 de N) libera el claim. Es un trade-off
 * explícito: un reintento puede reenviar a suscripciones que ya
 * recibieron el push exitosamente en el intento anterior (duplicado
 * ocasional) — se prefiere sobre perder el recordatorio por completo.
 */
export function shouldReleaseClaim(failedCount: number): boolean {
  return failedCount > 0;
}
