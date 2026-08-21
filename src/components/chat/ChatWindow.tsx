"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { useChatRealtime, type PresenceState } from "@/lib/realtime/useChatRealtime";
import { sendMessage, markRead, getMessages } from "@/lib/actions/chat";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { PresenceBar } from "./PresenceBar";
import { useToast } from "@/components/ui/Toaster";
import type { Message, MessageType, ChatParticipant } from "@/lib/types";

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  otherUser: ChatParticipant;
  initialMessages: Message[];
  initialHasMore: boolean;
}

export function ChatWindow({
  conversationId,
  currentUserId,
  otherUser,
  initialMessages,
  initialHasMore,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [presence, setPresence] = useState<PresenceState>({ online: false, lastSeen: null });
  const [isTyping, setIsTyping] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const toast = useToast();

  // Scroll helpers
  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  }, []);

  const checkAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Initial setup
  useEffect(() => {
    void markRead(conversationId);
    scrollToBottom(false);
  }, [conversationId, scrollToBottom]);

  // Track scroll for auto-scroll decision
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handle = () => {
      atBottomRef.current = checkAtBottom();
      if (atBottomRef.current) setNewMsgCount(0);
    };
    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }, [checkAtBottom]);

  // Realtime callbacks
  const handleNewMessage = useCallback(
    (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (atBottomRef.current) {
        scrollToBottom();
        void markRead(conversationId);
      } else {
        setNewMsgCount((n) => n + 1);
      }
    },
    [conversationId, scrollToBottom]
  );

  const handleMessageRead = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, read_at: new Date().toISOString() } : m))
    );
  }, []);

  const { isConnected, sendTypingSignal } = useChatRealtime({
    conversationId,
    userId: currentUserId,
    onMessage: handleNewMessage,
    onMessageRead: handleMessageRead,
    onPresenceChange: setPresence,
    onTypingChange: setIsTyping,
  });

  // Load earlier messages
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    const cursor = messages[0]?.created_at;
    if (!cursor) return;

    setIsLoadingMore(true);
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    try {
      const result = await getMessages(conversationId, cursor);
      setMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, hasMore, isLoadingMore, messages]);

  // Send a message with optimistic UI
  const handleSend = useCallback(
    async (
      body: string,
      type: MessageType = "text",
      extra?: { url?: string; metadata?: Record<string, number | string | boolean | null> }
    ) => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: Message = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        body,
        type,
        attachment_url: extra?.url ?? null,
        metadata: extra?.metadata ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setIsSending(true);
      scrollToBottom();

      try {
        const result = await sendMessage(
          conversationId,
          body,
          type,
          extra?.url,
          extra?.metadata
        );
        if (result.error) {
          toast(result.error, "error");
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        } else if (result.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, id: result.messageId! } : m
            )
          );
        }
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, currentUserId, scrollToBottom, toast]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card">
      <PresenceBar user={otherUser} presence={presence} isConnected={isConnected} />

      {/* Connection warning */}
      {!isConnected && (
        <div className="bg-warning-50 px-4 py-1.5 text-center text-xs font-medium text-warning-700" role="alert">
          Reconectando al chat…
        </div>
      )}

      {/* Message list */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={listRef}
          className="no-scrollbar h-full overflow-y-auto px-3 py-2"
          role="log"
          aria-label="Historial de mensajes"
          aria-live="polite"
        >
          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center py-2">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-40"
                aria-label="Cargar mensajes anteriores"
              >
                {isLoadingMore ? "Cargando…" : "↑ Cargar mensajes anteriores"}
              </button>
            </div>
          )}

          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            isTyping={isTyping}
          />
        </div>

        {/* New messages pill */}
        {newMsgCount > 0 && (
          <button
            onClick={() => {
              setNewMsgCount(0);
              scrollToBottom();
            }}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-glow-sm"
            aria-label={`${newMsgCount} mensaje${newMsgCount > 1 ? "s" : ""} nuevo${newMsgCount > 1 ? "s" : ""}`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {newMsgCount} {newMsgCount === 1 ? "nuevo" : "nuevos"}
          </button>
        )}
      </div>

      <MessageInput
        conversationId={conversationId}
        onSend={handleSend}
        onTyping={sendTypingSignal}
        disabled={isSending}
      />
    </div>
  );
}
