"use client";

import { memo } from "react";
import { isSameDay } from "date-fns";
import { MessageBubble } from "./MessageBubble";
import { DateSeparator } from "./DateSeparator";
import { TypingIndicator } from "./TypingIndicator";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  isTyping: boolean;
  /** Cursor de lectura del OTRO participante (Fase C4-G8.2) — null si nunca leyó. */
  otherParticipantLastReadAt: string | null;
}

export const MessageList = memo(function MessageList({
  messages,
  currentUserId,
  isTyping,
  otherParticipantLastReadAt,
}: MessageListProps) {
  if (messages.length === 0 && !isTyping) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm font-medium text-ink-muted">No hay mensajes aún</p>
        <p className="text-xs text-ink-muted">Sé el primero en escribir</p>
      </div>
    );
  }

  const items: JSX.Element[] = [];

  messages.forEach((msg, i) => {
    const msgDate = new Date(msg.created_at);
    const prevMsg = messages[i - 1];
    const showSeparator = !prevMsg || !isSameDay(new Date(prevMsg.created_at), msgDate);

    if (showSeparator) {
      items.push(<DateSeparator key={`sep-${msg.id}`} date={msgDate} />);
    }

    items.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isMine={msg.sender_id === currentUserId}
        isOptimistic={msg.id.startsWith("optimistic-")}
        otherParticipantLastReadAt={otherParticipantLastReadAt}
      />
    );
  });

  return (
    <div className="flex flex-col gap-1" role="list">
      {items}
      <TypingIndicator visible={isTyping} />
    </div>
  );
});
