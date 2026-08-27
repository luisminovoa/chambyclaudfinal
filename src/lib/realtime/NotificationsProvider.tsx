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
   * relevante para el usuario actual (nunca los propios). Reemplaza la
   * dependencia de `notifications` postgres_changes para disparar
   * refresh de unread — ver auditoría C4-G8.5B-N: el Realtime de
   * `notifications` nunca entregó el evento pese a publicación/RLS/grants
   * idénticos a `messages` (comprobado con datos reales de Production),
   * mientras que `messages` sí está demostrado funcionando.
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
 * duplicar canal.
 *
 * Fase C4-G8.5R (experimento, temporal): el listener global de `messages`
 * vive en un SEGUNDO RealtimeChannel independiente (`messages:{userId}`),
 * no en este mismo canal — ver useEffect más abajo. Hasta el commit
 * 298f029 (C4-G8.5P/Q) ambos bindings compartían este único canal y el
 * INSERT de `messages` nunca llegó al cliente (sin log
 * `[C4-G8.5Q TEMP] messages INSERT recibido`) pese a RLS/publicación/
 * grants idénticos a los de `notifications` y a los del canal, ya probado
 * funcionando, de useChatRealtime.ts. Este experimento aísla esa variable:
 * ¿el INSERT de `messages` llega cuando está en un canal propio, sin
 * compartir bindings con `notifications`?
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

  // Canal 1 — notifications. Sin cambios de arquitectura respecto a antes
  // de C4-G8.5R: sigue siendo el único canal `user:{userId}` de la app.
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const notificationsChannel = supabase.channel(`user:${userId}`);

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

    // eslint-disable-next-line no-console -- C4-G8.5R: diagnóstico temporal, retirar tras obtener evidencia
    console.log("[C4-G8.5R TEMP] notifications channel created");

    notificationsChannel.subscribe((status, err) => {
      // eslint-disable-next-line no-console -- C4-G8.5R TEMP
      console.log("[C4-G8.5R TEMP] notifications subscribe status", status, err ?? "");
      setIsConnected(status === "SUBSCRIBED");
    });

    return () => {
      supabase.removeChannel(notificationsChannel);
      setIsConnected(false);
    };
  }, [userId]);

  // Canal 2 — messages (Fase C4-G8.5R, experimental/temporal). Canal
  // independiente del de notifications, topic distinto (`messages:{userId}`)
  // para no compartir bindings con el canal 1. Sin `filter`: RLS
  // (messages_select_participant) es quien decide qué filas llegan, igual
  // que en useChatRealtime.ts. Nunca se registra para admins.
  useEffect(() => {
    if (!userId || isAdmin) return;

    const supabase = createClient();
    const messagesChannel = supabase.channel(`messages:${userId}`);

    // eslint-disable-next-line no-console -- C4-G8.5R: diagnóstico temporal, retirar tras obtener evidencia
    console.log("[C4-G8.5R TEMP] messages channel created", {
      topic: `messages:${userId}`,
      userId,
      isAdmin,
    });

    messagesChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new as Message;
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] messages INSERT received", {
          messageId: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          userId,
        });
        if (isOwnMessage(msg, userId)) {
          // eslint-disable-next-line no-console -- C4-G8.5R TEMP
          console.log("[C4-G8.5R TEMP] own message ignored", {
            messageId: msg.id,
            senderId: msg.sender_id,
            userId,
          });
          return; // nunca refrescar por mensajes propios
        }
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] message from another user", {
          messageId: msg.id,
          conversationId: msg.conversation_id,
        });
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] messages listener executed", {
          listeners: messageListenersRef.current.size,
        });
        messageListenersRef.current.forEach((handler) => handler(msg));
      }
    );

    messagesChannel.subscribe((status, err) => {
      // eslint-disable-next-line no-console -- C4-G8.5R TEMP
      console.log("[C4-G8.5R TEMP] messages subscribe status", status, err ?? "");
    });

    return () => {
      supabase.removeChannel(messagesChannel);
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
