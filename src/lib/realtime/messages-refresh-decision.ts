import type { Notification } from "@/lib/types";

/** Ventana mínima entre dos router.refresh() consecutivos por ráfagas de mensajes. */
export const MESSAGES_REFRESH_DEBOUNCE_MS = 1000;

/**
 * Decide si una notificación entrante debe disparar router.refresh() de
 * la lista de conversaciones/badges (Fase C4-G8.5) — separado en función
 * pura para poder probarlo sin useRouter()/useNotificationsContext(),
 * mismo patrón que canViewWorkerProfile() (src/lib/worker-profile-access.ts).
 *
 * Solo "new_message" dispara refresh — el resto de tipos de notificación
 * (application_accepted, new_rating, etc.) no tienen relación con
 * conversation_read_cursors/unread_count, así que refrescar por ellos
 * sería trabajo innecesario sin ningún beneficio visible.
 */
export function shouldRefreshForNotification(
  notification: Pick<Notification, "type">,
  lastRefreshAt: number,
  now: number
): boolean {
  if (notification.type !== "new_message") return false;
  return now - lastRefreshAt >= MESSAGES_REFRESH_DEBOUNCE_MS;
}
