"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useNotificationsContext } from "@/lib/realtime/NotificationsProvider";
import type { Notification } from "@/lib/types";

interface UseNotificationsOptions {
  userId: string;
  initialNotifications?: Notification[];
  initialUnreadCount?: number;
  onNewNotification?: (n: Notification) => void;
}

/**
 * Misma forma pública de siempre — { notifications, unreadCount, isConnected,
 * markRead, markAllRead, prependNotifications } — pero ya no abre su propio
 * canal Realtime. El canal único vive en <NotificationsProvider> (layout
 * raíz); este hook solo se suscribe a sus eventos, así que puede llamarse
 * desde tantos componentes como haga falta (Navbar + página de
 * notificaciones a la vez) sin volver a chocar con el error
 * "cannot add `postgres_changes` callbacks... after subscribe()".
 *
 * `initialUnreadCount` ya no siembra el contador (eso lo hace el Provider,
 * una sola vez, en el layout) — se mantiene en la firma para no romper a
 * los dos call sites existentes, pero queda sin efecto para evitar que dos
 * instancias se pisen el contador compartido.
 */
export function useNotifications({
  userId,
  initialNotifications = [],
  onNewNotification,
}: UseNotificationsOptions) {
  const { unreadCount, isConnected, bumpUnread, setUnreadCount, subscribe } =
    useNotificationsContext();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const onNewRef = useRef(onNewNotification);
  onNewRef.current = onNewNotification;

  useEffect(() => {
    if (!userId) return;
    return subscribe((n) => {
      setNotifications((prev) => [n, ...prev]);
      onNewRef.current?.(n);
    });
  }, [userId, subscribe]);

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      bumpUnread(-1);
    },
    [bumpUnread]
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, [setUnreadCount]);

  const prependNotifications = useCallback((items: Notification[]) => {
    setNotifications((prev) => {
      const ids = new Set(prev.map((n) => n.id));
      return [...prev, ...items.filter((n) => !ids.has(n.id))];
    });
  }, []);

  return { notifications, unreadCount, isConnected, markRead, markAllRead, prependNotifications };
}
