"use client";

import { useMessagesRefreshOnNewMessage } from "@/lib/realtime/useMessagesRefreshOnNewMessage";

/**
 * Componente sin salida visual — solo dispara router.refresh() cuando
 * llega una notificación "new_message" (Fase C4-G8.5), para que la lista
 * de conversaciones y sus contadores de no-leídos se actualicen sin F5.
 * Montado dentro de /messages/page.tsx (Server Component) para no
 * convertir esa página entera en Client Component.
 */
export function MessagesListRefresher() {
  useMessagesRefreshOnNewMessage();
  return null;
}
