"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotificationsContext } from "@/lib/realtime/NotificationsProvider";
import { shouldRefreshForNewMessage } from "@/lib/realtime/messages-refresh-decision";

/**
 * Refresca los Server Components de la ruta actual cuando llega un
 * `messages` INSERT relevante (Fase C4-G8.5P) — se suscribe vía
 * `subscribeToNewMessages()` a NotificationsProvider, sin abrir ningún
 * canal Realtime propio. Desde la Fase C4-G8.5R (experimental) ese
 * listener del Provider vive en un canal `messages:{userId}` separado del
 * canal `user:{userId}` de `notifications` — este hook no depende de cuál
 * sea el canal físico, solo del callback expuesto por el Provider.
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
  const { subscribeToNewMessages } = useNotificationsContext();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    return subscribeToNewMessages(() => {
      const now = Date.now();
      if (!shouldRefreshForNewMessage(lastRefreshRef.current, now)) {
        // eslint-disable-next-line no-console -- C4-G8.5R: diagnóstico temporal, retirar tras obtener evidencia
        console.log("[C4-G8.5R TEMP] refresh blocked by debounce");
        return;
      }
      lastRefreshRef.current = now;
      // eslint-disable-next-line no-console -- C4-G8.5R TEMP
      console.log("[C4-G8.5R TEMP] router.refresh executed");
      router.refresh();
    });
  }, [subscribeToNewMessages, router]);
}
