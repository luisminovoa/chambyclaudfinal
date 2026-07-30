import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Briefcase,
  BookmarkCheck,
  CheckCircle,
  XCircle,
  MessageCircle,
  Trophy,
  Star,
  Clock,
  Bell,
  ShieldAlert,
} from "lucide-react";
import type { Notification, NotificationType } from "@/lib/types";

const TYPE_META: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  new_application: { icon: Briefcase, color: "text-primary-600", bg: "bg-primary-50" },
  application_accepted: { icon: CheckCircle, color: "text-success-600", bg: "bg-success-50" },
  application_shortlisted: { icon: BookmarkCheck, color: "text-sky-600", bg: "bg-sky-50" },
  application_rejected: { icon: XCircle, color: "text-danger-600", bg: "bg-danger-50" },
  new_message: { icon: MessageCircle, color: "text-primary-600", bg: "bg-primary-50" },
  job_started: { icon: Trophy, color: "text-warning-600", bg: "bg-warning-50" },
  job_completed: { icon: Trophy, color: "text-success-600", bg: "bg-success-50" },
  new_rating: { icon: Star, color: "text-warning-500", bg: "bg-warning-50" },
  reminder: { icon: Clock, color: "text-ink-muted", bg: "bg-slate-100" },
  system: { icon: Bell, color: "text-primary-600", bg: "bg-primary-50" },
  admin_alert: { icon: ShieldAlert, color: "text-danger-600", bg: "bg-danger-50" },
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-4 border-danger-500",
  high: "border-l-4 border-warning-500",
  normal: "",
  low: "",
};

interface NotificationItemProps {
  notification: Notification;
  onClick: (n: Notification) => void;
}

export function NotificationItem({ notification: n, onClick }: NotificationItemProps) {
  const meta = TYPE_META[n.type] ?? TYPE_META.system;
  const Icon = meta.icon;
  const priorityBorder = PRIORITY_BORDER[n.priority] ?? "";

  return (
    <button
      type="button"
      onClick={() => onClick(n)}
      className={[
        "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100",
        n.is_read ? "" : "bg-primary-50/40",
        priorityBorder,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${meta.bg}`}>
        <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${n.is_read ? "text-ink-muted" : "font-semibold text-ink"}`}
        >
          {n.title}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted line-clamp-2">{n.body}</p>
        <p className="mt-1 text-[10px] text-ink-muted">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
        </p>
      </div>

      {!n.is_read && (
        <span className="shrink-0 mt-2 h-2 w-2 rounded-full bg-primary-600" aria-hidden />
      )}
    </button>
  );
}
