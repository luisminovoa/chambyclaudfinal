"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

interface UseNotificationsOptions {
  userId: string;
  initialNotifications?: Notification[];
  initialUnreadCount?: number;
  onNewNotification?: (n: Notification) => void;
}

export function useNotifications({
  userId,
  initialNotifications = [],
  initialUnreadCount = 0,
  onNewNotification,
}: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const onNewRef = useRef(onNewNotification);
  onNewRef.current = onNewNotification;

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase.channel(`user:${userId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications((prev) => [n, ...prev]);
          setUnreadCount((c) => c + 1);
          onNewRef.current?.(n);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [userId]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, []);

  const prependNotifications = useCallback((items: Notification[]) => {
    setNotifications((prev) => {
      const ids = new Set(prev.map((n) => n.id));
      return [...prev, ...items.filter((n) => !ids.has(n.id))];
    });
  }, []);

  return { notifications, unreadCount, isConnected, markRead, markAllRead, prependNotifications };
}
