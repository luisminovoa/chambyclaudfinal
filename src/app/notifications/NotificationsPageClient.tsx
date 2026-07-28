"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Bell } from "lucide-react";
import { isToday, isYesterday, format } from "date-fns";
import { es } from "date-fns/locale";
import { useNotifications } from "@/lib/realtime/useNotifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import {
  getNotifications,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { ActionResult } from "@/lib/actions/auth";
import type { Notification } from "@/lib/types";

type Filter = "all" | "unread" | "jobs" | "messages";
const FILTER_LABELS: Record<Filter, string> = {
  all: "Todas",
  unread: "No leídas",
  jobs: "Trabajos",
  messages: "Mensajes",
};

function getNavPath(n: Notification): string | null {
  if (n.type === "new_message" && n.conversation_id) return `/messages/${n.conversation_id}`;
  if (n.job_id) return `/jobs/${n.job_id}`;
  return null;
}

function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "d 'de' MMMM", { locale: es });
}

interface NotificationsPageClientProps {
  userId: string;
  initialNotifications: Notification[];
  initialHasMore: boolean;
  initialUnreadCount: number;
  markAllAction: () => Promise<ActionResult>;
}

export function NotificationsPageClient({
  userId,
  initialNotifications,
  initialHasMore,
  initialUnreadCount,
  markAllAction,
}: NotificationsPageClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [cursor, setCursor] = useState<string | undefined>(
    initialNotifications.at(-1)?.created_at
  );
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { notifications, unreadCount, markRead, markAllRead, prependNotifications } =
    useNotifications({
      userId,
      initialNotifications,
      initialUnreadCount,
    });

  const handleLoadMore = useCallback(async () => {
    setLoading(true);
    const result = await getNotifications(cursor, filter);
    prependNotifications(result.notifications);
    setHasMore(result.hasMore);
    setCursor(result.notifications.at(-1)?.created_at);
    setLoading(false);
  }, [cursor, filter, prependNotifications]);

  const handleFilterChange = useCallback(
    async (f: Filter) => {
      setFilter(f);
      setLoading(true);
      const result = await getNotifications(undefined, f);
      prependNotifications(result.notifications);
      setHasMore(result.hasMore);
      setCursor(result.notifications.at(-1)?.created_at);
      setLoading(false);
    },
    [prependNotifications]
  );

  async function handleClickNotification(n: Notification) {
    if (!n.is_read) {
      markRead(n.id);
      await markNotificationRead(n.id);
    }
    const path = getNavPath(n);
    if (path) router.push(path);
  }

  async function handleMarkAll() {
    markAllRead();
    startTransition(async () => {
      await markAllAction();
    });
  }

  const filtered =
    filter === "all"
      ? notifications
      : filter === "unread"
        ? notifications.filter((n) => !n.is_read)
        : filter === "jobs"
          ? notifications.filter((n) =>
              ["new_application", "application_accepted", "application_rejected", "job_started", "job_completed"].includes(
                n.type
              )
            )
          : notifications.filter((n) => n.type === "new_message");

  // Group by date
  const grouped: { label: string; items: Notification[] }[] = [];
  for (const n of filtered) {
    const label = dateGroupLabel(n.created_at);
    const last = grouped.at(-1);
    if (last?.label === label) {
      last.items.push(n);
    } else {
      grouped.push({ label, items: [n] });
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Notificaciones</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todo como leído
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => handleFilterChange(f)}
            className={[
              "shrink-0 px-4 py-2 text-sm font-medium transition-colors",
              filter === f
                ? "border-b-2 border-primary-600 text-primary-600"
                : "text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {FILTER_LABELS[f]}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading && filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-muted">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Bell className="mb-4 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-ink-muted">No hay notificaciones</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-slate-100">
          {grouped.map(({ label, items }) => (
            <div key={label}>
              <p className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {label}
              </p>
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} onClick={handleClickNotification} />
              ))}
            </div>
          ))}
          {hasMore && (
            <div className="p-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className="btn-ghost !min-h-0 !px-5 !py-2 text-sm"
              >
                {loading ? "Cargando…" : "Ver más notificaciones"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
