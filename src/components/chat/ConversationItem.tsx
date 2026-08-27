import Link from "next/link";
import { BellOff, Archive } from "lucide-react";
import { isToday, isYesterday, format } from "date-fns";
import { es } from "date-fns/locale";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { jobStatusLabel } from "@/lib/utils";
import type { ConversationWithDetails } from "@/lib/types";

function formatConvTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ayer";
  return format(d, "dd/MM/yy", { locale: es });
}

function messagePreview(conv: ConversationWithDetails, currentUserId: string): string {
  const msg = conv.last_message;
  if (!msg) return "Sin mensajes aún";
  let text =
    msg.type === "image"
      ? "📷 Imagen"
      : msg.type === "location"
        ? "📍 Ubicación"
        : msg.body.length > 45
          ? msg.body.slice(0, 45) + "…"
          : msg.body;
  if (msg.sender_id === currentUserId) text = `Tú: ${text}`;
  return text;
}

interface ConversationItemProps {
  conversation: ConversationWithDetails;
  currentUserId: string;
}

export function ConversationItem({ conversation, currentUserId }: ConversationItemProps) {
  const isEmployer = conversation.employer_id === currentUserId;
  const otherUser = isEmployer ? conversation.worker : conversation.employer;
  const settings = conversation.settings;
  const isMuted = settings?.is_muted ?? false;
  const isArchived = settings?.is_archived ?? false;
  const hasUnread = conversation.unread_count > 0 && !isMuted;
  const lastTime = conversation.last_message?.created_at ?? conversation.created_at;

  return (
    <Link
      href={`/messages/${conversation.id}`}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100"
    >
      {/* Avatar with unread dot */}
      <div className="relative shrink-0">
        <Avatar
          name={otherUser?.full_name ?? "?"}
          src={otherUser?.avatar_url}
          size="md"
        />
        {hasUnread && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white leading-none"
            aria-hidden
          >
            {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={[
              "flex-1 truncate text-sm",
              hasUnread ? "font-bold text-ink" : "font-semibold text-ink",
            ].join(" ")}
          >
            {otherUser?.full_name ?? "Usuario"}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            {isMuted && <BellOff className="h-3 w-3 text-slate-400" aria-label="Silenciado" />}
            {isArchived && <Archive className="h-3 w-3 text-slate-400" aria-label="Archivado" />}
            <span
              className={[
                "text-xs",
                hasUnread ? "font-semibold text-primary-600" : "text-ink-muted",
              ].join(" ")}
            >
              {formatConvTime(lastTime)}
            </span>
          </div>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={[
              "flex-1 truncate text-xs",
              hasUnread ? "font-medium text-ink" : "text-ink-muted",
            ].join(" ")}
          >
            {messagePreview(conversation, currentUserId)}
          </p>
          {conversation.job && (
            <>
              <span className="shrink-0 truncate text-[10px] text-ink-muted max-w-[80px]">
                {conversation.job.title.length > 18
                  ? conversation.job.title.slice(0, 18) + "…"
                  : conversation.job.title}
              </span>
              <Badge
                tone={jobStatusTone(conversation.job.status)}
                className="shrink-0 !px-1.5 !py-0.5 text-[9px]"
              >
                {jobStatusLabel(conversation.job.status)}
              </Badge>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
