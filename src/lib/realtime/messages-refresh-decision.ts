import type { Message } from "@/lib/types";

/** Ventana mínima entre dos router.refresh() consecutivos por ráfagas de mensajes. */
export const MESSAGES_REFRESH_DEBOUNCE_MS = 1000;

/**
 * El canal global de `messages` (Fase C4-G8.5P, NotificationsProvider) no
 * tiene filtro de conversación — entrega también los mensajes que el
 * propio usuario envió (RLS lo permite, es su propia conversación).
 * Nunca tiene sentido refrescar unread por un mensaje que uno mismo
 * escribió.
 */
export function isOwnMessage(message: Pick<Message, "sender_id">, userId: string): boolean {
  return message.sender_id === userId;
}

/**
 * Decide si un `messages` INSERT entrante debe disparar router.refresh()
 * de la lista de conversaciones/badges (Fase C4-G8.5P) — separado en
 * función pura para poder probarlo sin useRouter()/useNotificationsContext(),
 * mismo patrón que canViewWorkerProfile() (src/lib/worker-profile-access.ts).
 *
 * Reemplaza el disparador anterior basado en notifications "new_message"
 * (Fase C4-G8.5): la auditoría C4-G8.5B-N demostró, con datos reales de
 * Production, que Realtime nunca entregó ese evento pese a publicación/RLS/
 * grants idénticos a `messages` — mientras que `messages` sí está
 * comprobado funcionando (useChatRealtime.ts). El filtrado de "es mío" y
 * "no es mi propio mensaje" ya ocurre en el origen (NotificationsProvider,
 * antes de invocar el handler que llama a esta función) — aquí solo queda
 * la decisión de debounce.
 */
export function shouldRefreshForNewMessage(lastRefreshAt: number, now: number): boolean {
  return now - lastRefreshAt >= MESSAGES_REFRESH_DEBOUNCE_MS;
}
