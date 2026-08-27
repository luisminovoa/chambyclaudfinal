"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { isOwnMessage } from "@/lib/realtime/messages-refresh-decision";
import type { Message, Notification } from "@/lib/types";

interface NotificationsContextValue {
  unreadCount: number;
  isConnected: boolean;
  bumpUnread: (delta: number) => void;
  setUnreadCount: (n: number) => void;
  /** Registra un handler para cada INSERT nuevo del canal compartido. Devuelve la función de baja. */
  subscribe: (handler: (n: Notification) => void) => () => void;
  /**
   * Fase C4-G8.5P: registra un handler para cada `messages` INSERT
   * relevante para el usuario actual (nunca los propios) — dispara el
   * refresh de unread de las vistas de lista/badge (ver
   * `useMessagesRefreshOnNewMessage`), independiente del canal de
   * `notifications`.
   */
  subscribeToNewMessages: (handler: (msg: Message) => void) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

interface NotificationsProviderProps {
  userId: string | null;
  initialUnreadCount?: number;
  /**
   * Fase C4-G8.5P: excluye a los admins del canal global de `messages`.
   * `messages_select_participant` incluye `OR current_user_role() =
   * 'admin'`, así que un canal SIN filtro (necesario porque el objetivo es
   * "cualquier conversación propia", no una sola) le entregaría a un admin
   * cada mensaje de toda la plataforma — nunca se decidió eso como
   * comportamiento de producto, es solo un efecto lateral de esa RLS
   * pensada para otro fin (ver auditoría C4-G8.5O).
   */
  isAdmin?: boolean;
  children: React.ReactNode;
}

/**
 * Dueño único del canal Realtime `user:{userId}` (notifications) para toda
 * la app.
 *
 * Antes, cada componente que llamaba useNotifications() abría su propio
 * canal para el mismo topic. supabase-js reutiliza el canal existente
 * cuando el topic coincide (RealtimeClient.channel(), @supabase/realtime-js)
 * y RealtimeChannel.on() lanza si el canal ya está unido/uniéndose — por
 * eso el segundo consumidor montado (NotificationBell en el Navbar +
 * NotificationsPageClient en /notifications, montados a la vez) hacía
 * throw: "cannot add `postgres_changes` callbacks... after subscribe()".
 *
 * Este Provider hace el único supabase.channel()/.on()/.subscribe() para
 * `notifications` de toda la app; useNotifications() ahora se suscribe a
 * este Provider en vez de crear su propio canal — misma forma pública, sin
 * duplicar canal. El listener global de `messages` vive en un SEGUNDO
 * RealtimeChannel independiente (`messages:{userId}`) — ver useEffect más
 * abajo; la separación es solo por claridad de alcance de cada uno, no por
 * necesidad técnica (compartir un único canal para ambos bindings no era
 * la causa de que `messages` no entregara eventos).
 *
 * CAUSA RAÍZ Y FIX: ninguno de los dos canales de este Provider entregaba
 * jamás un INSERT, pese a RLS/publicación/grants idénticos a los del canal
 * de `useChatRealtime.ts` (que sí funciona) y pese a un `SELECT`
 * autenticado real exitoso sobre esas mismas filas. La causa:
 * `RealtimeChannel.subscribe()` (@supabase/realtime-js) lee
 * `this.socket.accessTokenValue` de forma SÍNCRONA en el instante exacto
 * de armar el `phx_join` — sin esperar nada. Como este Provider monta sus
 * canales en el efecto más temprano posible (root layout, primera carga
 * de página), competía con la hidratación asíncrona de la sesión de
 * `createBrowserClient()` (`auth.onAuthStateChange` solo dispara
 * `INITIAL_SESSION`/`SIGNED_IN` después — ver `_handleTokenChanged` en
 * `@supabase/supabase-js`). El `phx_join` salía sin `access_token`,
 * uniéndose efectivamente como `anon`: el canal igual reportaba
 * `SUBSCRIBED` (el join no requiere una fila visible), pero el servidor
 * de Realtime nunca entregaba nada porque bajo `anon` ninguna RLS de
 * `messages`/`notifications` deja pasar filas (`auth.uid()` es `null`).
 * `useChatRealtime.ts` nunca tuvo este problema porque se monta más tarde
 * (al navegar a una conversación), cuando la sesión ya está hidratada.
 *
 * Fix: ambos canales de abajo esperan `getSession()` y fuerzan
 * `realtime.setAuth(session.access_token)` antes de crear y suscribir su
 * canal. `TOKEN_REFRESHED`/`SIGNED_OUT` posteriores siguen gestionados por
 * el mecanismo interno de `@supabase/supabase-js` (`_handleTokenChanged`),
 * que ya empuja el token actualizado a los canales unidos sin
 * intervención de este componente.
 */
export function NotificationsProvider({
  userId,
  initialUnreadCount = 0,
  isAdmin = false,
  children,
}: NotificationsProviderProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Set<(n: Notification) => void>>(new Set());
  const messageListenersRef = useRef<Set<(msg: Message) => void>>(new Set());

  const subscribe = useCallback((handler: (n: Notification) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const subscribeToNewMessages = useCallback((handler: (msg: Message) => void) => {
    messageListenersRef.current.add(handler);
    return () => {
      messageListenersRef.current.delete(handler);
    };
  }, []);

  const bumpUnread = useCallback((delta: number) => {
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  // Canal 1 — notifications. Solo se crea/suscribe una vez confirmada una
  // sesión autenticada real (Fase C4-G8.6) — ver el docblock del
  // componente para la causa raíz que esto corrige.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const supabase = createClient();
    let notificationsChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      notificationsChannel = supabase.channel(`user:${userId}`);

      notificationsChannel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          setUnreadCount((c) => c + 1);
          listenersRef.current.forEach((handler) => handler(n));
        }
      );

      notificationsChannel.subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });
    })();

    return () => {
      cancelled = true;
      if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel);
      }
      setIsConnected(false);
    };
  }, [userId]);

  // Canal 2 — messages. Topic independiente del de notifications; sin
  // `filter`, RLS (messages_select_participant) decide qué filas llegan,
  // igual que en useChatRealtime.ts. Nunca se registra para admins. Mismo
  // mecanismo de espera de sesión que el Canal 1 (Fase C4-G8.6).
  useEffect(() => {
    if (!userId || isAdmin) return;

    let cancelled = false;
    const supabase = createClient();
    let messagesChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      messagesChannel = supabase.channel(`messages:${userId}`);

      messagesChannel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (isOwnMessage(msg, userId)) return; // nunca refrescar por mensajes propios
          messageListenersRef.current.forEach((handler) => handler(msg));
        }
      );

      messagesChannel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (messagesChannel) {
        supabase.removeChannel(messagesChannel);
      }
    };
  }, [userId, isAdmin]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, isConnected, bumpUnread, setUnreadCount, subscribe, subscribeToNewMessages }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotificationsContext debe usarse dentro de <NotificationsProvider>");
  }
  return ctx;
}
