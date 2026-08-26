"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

interface NotificationsContextValue {
  unreadCount: number;
  isConnected: boolean;
  bumpUnread: (delta: number) => void;
  setUnreadCount: (n: number) => void;
  /** Registra un handler para cada INSERT nuevo del canal compartido. Devuelve la función de baja. */
  subscribe: (handler: (n: Notification) => void) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

interface NotificationsProviderProps {
  userId: string | null;
  initialUnreadCount?: number;
  children: React.ReactNode;
}

/**
 * Dueño único del canal Realtime `user:{userId}` para toda la app.
 *
 * Antes, cada componente que llamaba useNotifications() abría su propio
 * canal para el mismo topic. supabase-js reutiliza el canal existente
 * cuando el topic coincide (RealtimeClient.channel(), @supabase/realtime-js)
 * y RealtimeChannel.on() lanza si el canal ya está unido/uniéndose — por
 * eso el segundo consumidor montado (NotificationBell en el Navbar +
 * NotificationsPageClient en /notifications, montados a la vez) hacía
 * throw: "cannot add `postgres_changes` callbacks... after subscribe()".
 *
 * Este Provider hace el único supabase.channel()/.on()/.subscribe() de
 * toda la app; useNotifications() ahora se suscribe a este Provider en
 * vez de crear su propio canal — misma forma pública, sin duplicar canal.
 */
export function NotificationsProvider({
  userId,
  initialUnreadCount = 0,
  children,
}: NotificationsProviderProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Set<(n: Notification) => void>>(new Set());

  const subscribe = useCallback((handler: (n: Notification) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const bumpUnread = useCallback((delta: number) => {
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const filter = `user_id=eq.${userId}`;
    // [C4-G8.5J TEMP] G: userId y filtro exactos usados al crear el canal.
    console.log("[C4-G8.5J TEMP] NotificationsProvider: creando canal", {
      topic: `user:${userId}`,
      userId,
      filter,
    });
    const channel = supabase.channel(`user:${userId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter,
        },
        (payload) => {
          // [C4-G8.5J TEMP] F: payload INSERT recibido realmente por el canal.
          console.log("[C4-G8.5J TEMP] NotificationsProvider: postgres_changes payload recibido", payload);
          const n = payload.new as Notification;
          setUnreadCount((c) => c + 1);
          listenersRef.current.forEach((handler) => handler(n));
        }
      )
      .subscribe((status, err) => {
        // [C4-G8.5J TEMP] B/C/D/E: status de la suscripción (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED).
        console.log("[C4-G8.5J TEMP] NotificationsProvider: subscribe status", status, err ?? "");
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [userId]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, isConnected, bumpUnread, setUnreadCount, subscribe }}
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
