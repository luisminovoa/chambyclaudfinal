"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotificationsContext } from "@/lib/realtime/NotificationsProvider";
import { shouldRefreshForNotification } from "@/lib/realtime/messages-refresh-decision";

/**
 * Refresca los Server Components de la ruta actual cuando llega una
 * notificación "new_message" (Fase C4-G8.5) — reutiliza el canal único ya
 * existente en NotificationsProvider (topic `user:{userId}`, ya recibe
 * "new_message" de cualquier conversación, ver notify_new_message() en
 * 0004_notifications.sql). No abre ningún canal Realtime nuevo: subscribe()
 * solo agrega un callback más al Set ya existente del Provider.
 *
 * router.refresh() vuelve a ejecutar getConversations()/
 * getMessagesUnreadCount() en el servidor (Server Components, sin caché
 * — ver staleTimes.dynamic:0 en next.config.js), así que unread_count/
 * totalUnread/el badge de BottomNav quedan al día sin F5. La lógica de
 * markRead()/useChatRealtime.ts dentro de una conversación abierta no se
 * toca — este hook es exclusivamente para las vistas de lista/badge.
 */
export function useMessagesRefreshOnNewMessage() {
  const router = useRouter();
  const { subscribe } = useNotificationsContext();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    return subscribe((n) => {
      const now = Date.now();
      if (!shouldRefreshForNotification(n, lastRefreshRef.current, now)) return;
      lastRefreshRef.current = now;
      router.refresh();
    });
  }, [subscribe, router]);
}
