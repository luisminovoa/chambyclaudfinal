"use client";

import { useState, useCallback, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X } from "lucide-react";
import { useNotifications } from "@/lib/realtime/useNotifications";
import { NotificationItem } from "./NotificationItem";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types";

interface NotificationBellProps {
  userId: string;
  initialUnreadCount: number;
  activeConversationId?: string;
}

type Filter = "all" | "unread" | "jobs" | "messages";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Todas",
  unread: "No leídas",
  jobs: "Trabajos",
  messages: "Mensajes",
};

function getNavPath(n: Notification): string | null {
  if (n.conversation_id) return `/messages/${n.conversation_id}`;
  if (n.job_id) return `/jobs/${n.job_id}`;
  return null;
}

export function NotificationBell({
  userId,
  initialUnreadCount,
  activeConversationId,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loadedNotifications, setLoadedNotifications] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleNewNotification = useCallback(
    (n: Notification) => {
      if (n.type === "new_message" && n.conversation_id === activeConversationId) return;
      setLoadedNotifications((prev) => [n, ...prev]);
    },
    [activeConversationId]
  );

  const { unreadCount, markRead, markAllRead } = useNotifications({
    userId,
    initialUnreadCount,
    onNewNotification: handleNewNotification,
  });

  const loadNotifications = useCallback(
    async (f: Filter, c?: string) => {
      setLoading(true);
      const result = await getNotifications(c, f);
      if (c) {
        setLoadedNotifications((prev) => [...prev, ...result.notifications]);
      } else {
        setLoadedNotifications(result.notifications);
      }
      setHasMore(result.hasMore);
      setCursor(result.notifications.at(-1)?.created_at);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    if (open) loadNotifications(filter);
  }, [open, filter, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  async function handleClickNotification(n: Notification) {
    if (!n.is_read) {
      markRead(n.id);
      await markNotificationRead(n.id);
    }
    const path = getNavPath(n);
    if (path) {
      setOpen(false);
      router.push(path);
    }
  }

  async function handleMarkAll() {
    markAllRead();
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} no leídas` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white leading-none"
          >
            {displayCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Centro de notificaciones"
          aria-live="polite"
          className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200 bg-white shadow-glow overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notificaciones</h2>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  title="Marcar todo como leído"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Todo leído
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar panel"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={[
                  "shrink-0 px-3 py-2 text-xs font-medium transition-colors",
                  filter === f
                    ? "border-b-2 border-primary-600 text-primary-600"
                    : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-[24rem] overflow-y-auto divide-y divide-slate-100">
            {loading && loadedNotifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-ink-muted">Cargando…</div>
            ) : loadedNotifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-ink-muted">
                No hay notificaciones
              </div>
            ) : (
              <>
                {loadedNotifications.map((n) => (
                  <NotificationItem key={n.id} notification={n} onClick={handleClickNotification} />
                ))}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => loadNotifications(filter, cursor)}
                    disabled={loading}
                    className="w-full py-3 text-xs text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    {loading ? "Cargando…" : "Ver más"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer link */}
          <div className="border-t border-slate-100 p-2 text-center">
            <a
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Ver todas las notificaciones →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
