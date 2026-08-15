"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Wifi, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ReportButton } from "@/components/reports/ReportButton";
import type { Profile } from "@/lib/types";
import type { PresenceState } from "@/lib/realtime/useChatRealtime";

interface PresenceBarProps {
  user: Profile;
  presence: PresenceState;
  isConnected: boolean;
}

export function PresenceBar({ user, presence, isConnected }: PresenceBarProps) {
  const statusText = !isConnected
    ? "Reconectando..."
    : presence.online
      ? "En línea"
      : presence.lastSeen
        ? `Última conexión ${formatDistanceToNow(new Date(presence.lastSeen), { addSuffix: true, locale: es })}`
        : "Desconectado";

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
      <div className="relative shrink-0">
        <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
        <span
          className={[
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
            presence.online ? "bg-success-500" : "bg-slate-300",
          ].join(" ")}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{user.full_name}</p>
        <p className="flex items-center gap-1 text-xs text-ink-muted">
          {!isConnected ? (
            <WifiOff className="h-3 w-3 text-warning-500" />
          ) : (
            presence.online && <Wifi className="h-3 w-3 text-success-500" />
          )}
          {statusText}
        </p>
      </div>

      <ReportButton
        targetType="user"
        reportedUserId={user.id}
        reportedUserRole={user.role}
        targetLabel={user.full_name}
        variant="icon"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
      />
    </div>
  );
}
