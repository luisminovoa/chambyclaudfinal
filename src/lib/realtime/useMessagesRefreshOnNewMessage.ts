"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotificationsContext } from "@/lib/realtime/NotificationsProvider";
import { shouldRefreshForNewMessage } from "@/lib/realtime/messages-refresh-decision";

/**
 * Refresca los Server Components de la ruta actual cuando llega un
 * `messages` INSERT relevante (Fase C4-G8.5P) — reutiliza el canal único
 * ya existente en NotificationsProvider (topic `user:{userId}`), que
 * ahora también escucha `messages` sin filtro (protegido por
 * `messages_select_participant`, comprobado funcionando con Realtime, a
 * diferencia de `notifications` — ver auditoría C4-G8.5B-N). No abre
 * ningún canal Realtime nuevo: subscribeToNewMessages() solo agrega un
 * callback más al Set ya existente del Provider.
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
        // eslint-disable-next-line no-console -- C4-G8.5Q: diagnóstico temporal, retirar tras obtener evidencia
        console.log("[C4-G8.5Q TEMP] refresh bloqueado por debounce");
        return;
      }
      lastRefreshRef.current = now;
      // eslint-disable-next-line no-console -- C4-G8.5Q TEMP
      console.log("[C4-G8.5Q TEMP] router.refresh ejecutado");
      router.refresh();
    });
  }, [subscribeToNewMessages, router]);
}
