"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export interface PresenceState {
  online: boolean;
  lastSeen: string | null;
}

interface UseChatRealtimeOptions {
  conversationId: string;
  userId: string;
  onMessage: (msg: Message) => void;
  onMessageRead: (messageId: string) => void;
  onPresenceChange: (state: PresenceState) => void;
  onTypingChange: (isTyping: boolean) => void;
}

export function useChatRealtime({
  conversationId,
  userId,
  onMessage,
  onMessageRead,
  onPresenceChange,
  onTypingChange,
}: UseChatRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const sendTypingSignal = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1000) return;
    lastTypingSentRef.current = now;

    channelRef.current?.send({
      type: "broadcast",
      event: "typing_start",
      payload: { user_id: userId },
    });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      channelRef.current?.send({
        type: "broadcast",
        event: "typing_stop",
        payload: { user_id: userId },
      });
    }, 3000);
  }, [userId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: {
        presence: { key: userId },
        broadcast: { self: false },
      },
    });
    channelRef.current = channel;

    // New messages from other participant
    channel.on(
      "postgres_changes" as Parameters<typeof channel.on>[0],
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: Message }) => {
        if (payload.new.sender_id !== userId) {
          onMessage(payload.new);
        }
      }
    );

    // Read receipts (our messages being marked read by the other party)
    channel.on(
      "postgres_changes" as Parameters<typeof channel.on>[0],
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: Message }) => {
        if (payload.new.read_at && payload.new.sender_id === userId) {
          onMessageRead(payload.new.id);
        }
      }
    );

    // Presence: online/offline status of the other participant
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string }>();
        const otherOnline = Object.keys(state).some((k) => k !== userId);
        if (!otherOnline) {
          onPresenceChange({ online: false, lastSeen: new Date().toISOString() });
        }
      })
      .on("presence", { event: "join" }, ({ key }: { key: string }) => {
        if (key !== userId) onPresenceChange({ online: true, lastSeen: null });
      })
      .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        if (key !== userId) {
          onPresenceChange({ online: false, lastSeen: new Date().toISOString() });
        }
      });

    // Typing indicators
    channel
      .on("broadcast", { event: "typing_start" }, ({ payload }: { payload: { user_id: string } }) => {
        if (payload.user_id !== userId) onTypingChange(true);
      })
      .on("broadcast", { event: "typing_stop" }, ({ payload }: { payload: { user_id: string } }) => {
        if (payload.user_id !== userId) onTypingChange(false);
      });

    channel.subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        setIsConnected(false);
      }
    });

    // Pause presence tracking when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        channel.untrack();
      } else {
        channel.track({ user_id: userId, online_at: new Date().toISOString() });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, userId, onMessage, onMessageRead, onPresenceChange, onTypingChange]);

  return { isConnected, sendTypingSignal };
}
