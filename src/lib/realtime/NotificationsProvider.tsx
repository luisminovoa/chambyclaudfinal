"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { isOwnMessage } from "@/lib/realtime/messages-refresh-decision";
import type { Message, Notification } from "@/lib/types";

interface NotificationsContextValue {
  unreadCount: number;
  isConnected: boolean;
  bumpUnread: (delta: number) => void;
  setUnreadCount: (n: number) => void;
  /** Registra un handler para cada INSERT nuevo del canal compartido. Devuelve la función de baja. */
  subscribe: (handler: (n: Notification) => void) => () => void;
  /**
   * Fase C4-G8.5P: registra un handler para cada `messages` INSERT
   * relevante para el usuario actual (nunca los propios). Reemplaza la
   * dependencia de `notifications` postgres_changes para disparar
   * refresh de unread — ver auditoría C4-G8.5B-N: el Realtime de
   * `notifications` nunca entregó el evento pese a publicación/RLS/grants
   * idénticos a `messages` (comprobado con datos reales de Production),
   * mientras que `messages` sí está demostrado funcionando.
   */
  subscribeToNewMessages: (handler: (msg: Message) => void) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

interface NotificationsProviderProps {
  userId: string | null;
  initialUnreadCount?: number;
  /**
   * Fase C4-G8.5P: excluye a los admins del canal global de `messages`.
   * `messages_select_participant` incluye `OR current_user_role() =
   * 'admin'`, así que un canal SIN filtro (necesario porque el objetivo es
   * "cualquier conversación propia", no una sola) le entregaría a un admin
   * cada mensaje de toda la plataforma — nunca se decidió eso como
   * comportamiento de producto, es solo un efecto lateral de esa RLS
   * pensada para otro fin (ver auditoría C4-G8.5O).
   */
  isAdmin?: boolean;
  children: React.ReactNode;
}

/**
 * Dueño único del canal Realtime `user:{userId}` (notifications) para toda
 * la app.
 *
 * Antes, cada componente que llamaba useNotifications() abría su propio
 * canal para el mismo topic. supabase-js reutiliza el canal existente
 * cuando el topic coincide (RealtimeClient.channel(), @supabase/realtime-js)
 * y RealtimeChannel.on() lanza si el canal ya está unido/uniéndose — por
 * eso el segundo consumidor montado (NotificationBell en el Navbar +
 * NotificationsPageClient en /notifications, montados a la vez) hacía
 * throw: "cannot add `postgres_changes` callbacks... after subscribe()".
 *
 * Este Provider hace el único supabase.channel()/.on()/.subscribe() para
 * `notifications` de toda la app; useNotifications() ahora se suscribe a
 * este Provider en vez de crear su propio canal — misma forma pública, sin
 * duplicar canal.
 *
 * Fase C4-G8.5R (experimento, temporal): el listener global de `messages`
 * vive en un SEGUNDO RealtimeChannel independiente (`messages:{userId}`),
 * no en este mismo canal — ver useEffect más abajo. Hasta el commit
 * 298f029 (C4-G8.5P/Q) ambos bindings compartían este único canal y el
 * INSERT de `messages` nunca llegó al cliente (sin log
 * `[C4-G8.5Q TEMP] messages INSERT recibido`) pese a RLS/publicación/
 * grants idénticos a los de `notifications` y a los del canal, ya probado
 * funcionando, de useChatRealtime.ts. Este experimento aísla esa variable:
 * ¿el INSERT de `messages` llega cuando está en un canal propio, sin
 * compartir bindings con `notifications`?
 */
export function NotificationsProvider({
  userId,
  initialUnreadCount = 0,
  isAdmin = false,
  children,
}: NotificationsProviderProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Set<(n: Notification) => void>>(new Set());
  const messageListenersRef = useRef<Set<(msg: Message) => void>>(new Set());

  const subscribe = useCallback((handler: (n: Notification) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const subscribeToNewMessages = useCallback((handler: (msg: Message) => void) => {
    messageListenersRef.current.add(handler);
    return () => {
      messageListenersRef.current.delete(handler);
    };
  }, []);

  const bumpUnread = useCallback((delta: number) => {
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  // Fase C4-G8.5T (diagnóstico temporal, una sola ejecución por sesión de
  // usuario): confirma con el MISMO createClient() del navegador —
  // sesión autenticada real, no SQL Editor/service_role — si auth.uid()
  // de A puede leer vía RLS el mensaje y la notification reales usados en
  // C4-G8.5S. No crea ningún canal Realtime nuevo, no toca la suscripción
  // existente, no escribe nada.
  const diagnosticRanRef = useRef(false);
  useEffect(() => {
    if (!userId || diagnosticRanRef.current) return;
    diagnosticRanRef.current = true;

    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // eslint-disable-next-line no-console -- C4-G8.5T: diagnóstico temporal, retirar tras obtener evidencia
      console.log("[C4-G8.5T TEMP] authenticated user", { userId: user?.id ?? null });

      const messagesResult = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, created_at")
        .eq("id", "832976ee-14ea-48f4-babf-cabefc031cdb")
        .maybeSingle();
      // eslint-disable-next-line no-console -- C4-G8.5T TEMP
      console.log("[C4-G8.5T TEMP] messages SELECT result", {
        success: !messagesResult.error,
        found: !!messagesResult.data,
        errorCode: messagesResult.error?.code ?? null,
        errorMessage: messagesResult.error?.message ?? null,
      });

      const notificationsResult = await supabase
        .from("notifications")
        .select("id, user_id, type, conversation_id, is_read, created_at")
        .eq("id", "70b2873e-cf13-4b0b-a0e8-76a8608717da")
        .maybeSingle();
      // eslint-disable-next-line no-console -- C4-G8.5T TEMP
      console.log("[C4-G8.5T TEMP] notifications SELECT result", {
        success: !notificationsResult.error,
        found: !!notificationsResult.data,
        errorCode: notificationsResult.error?.code ?? null,
        errorMessage: notificationsResult.error?.message ?? null,
      });
    })();
  }, [userId]);

  // Fase C4-G8.5U (experimento de aislamiento, temporal): canal Realtime
  // mínimo e independiente, sin ninguna otra lógica de la app (sin
  // isOwnMessage, sin messageListenersRef, sin router.refresh, sin UI) —
  // responde únicamente si postgres_changes entrega un INSERT real de
  // public.messages a este navegador. Bloque autocontenido, removible sin
  // afectar el resto del componente.
  const experimentRanRef = useRef(false);
  useEffect(() => {
    if (!userId || experimentRanRef.current) return;
    experimentRanRef.current = true;

    const supabase = createClient();
    const experimentChannel = supabase
      .channel(`c4-g8-5u-test-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          // eslint-disable-next-line no-console -- C4-G8.5U: experimento temporal, retirar tras obtener evidencia
          console.log("[C4-G8.5U TEMP] messages INSERT RECEIVED", {
            id: payload.new?.id ?? null,
            conversationId: payload.new?.conversation_id ?? null,
            senderId: payload.new?.sender_id ?? null,
            userId,
          });
        }
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console -- C4-G8.5U TEMP
        console.log("[C4-G8.5U TEMP] subscribe status", {
          status,
          error: err ? String(err) : null,
        });
      });

    return () => {
      supabase.removeChannel(experimentChannel);
    };
  }, [userId]);

  // Fase C4-G8.5V (experimento A/B, temporal): dos canales mínimos e
  // independientes del resto de la app, para aislar si un `filter` de
  // `conversation_id` cambia la entrega del INSERT respecto a un canal
  // global sin filter (C4-G8.5U). Sin isOwnMessage, sin
  // messageListenersRef, sin router.refresh, sin UI. Excluido para admin
  // con el mismo criterio ya usado en el resto del Provider.
  const abTestRanRef = useRef(false);
  useEffect(() => {
    if (!userId || isAdmin || abTestRanRef.current) return;
    abTestRanRef.current = true;

    const supabase = createClient();

    const globalChannel = supabase
      .channel(`c4-g8-5v-global-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          // eslint-disable-next-line no-console -- C4-G8.5V: experimento temporal, retirar tras obtener evidencia
          console.log("[C4-G8.5V TEMP] GLOBAL INSERT RECEIVED", {
            id: payload.new?.id ?? null,
            conversationId: payload.new?.conversation_id ?? null,
            senderId: payload.new?.sender_id ?? null,
          });
        }
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console -- C4-G8.5V TEMP
        console.log("[C4-G8.5V TEMP] GLOBAL SUBSCRIBE", {
          status,
          error: err ? String(err) : null,
        });
      });

    const filteredChannel = supabase
      .channel(`c4-g8-5v-filtered-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "conversation_id=eq.f17058b7-92ff-4102-b14e-1ea4b23af069",
        },
        (payload) => {
          // eslint-disable-next-line no-console -- C4-G8.5V TEMP
          console.log("[C4-G8.5V TEMP] FILTERED INSERT RECEIVED", {
            id: payload.new?.id ?? null,
            conversationId: payload.new?.conversation_id ?? null,
            senderId: payload.new?.sender_id ?? null,
          });
        }
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console -- C4-G8.5V TEMP
        console.log("[C4-G8.5V TEMP] FILTERED SUBSCRIBE", {
          status,
          error: err ? String(err) : null,
        });
      });

    return () => {
      supabase.removeChannel(globalChannel);
      supabase.removeChannel(filteredChannel);
    };
  }, [userId, isAdmin]);

  // Fase C4-G8.5W (diagnóstico temporal): observa el timing/estado del JWT
  // del socket de Realtime (RealtimeClient.accessTokenValue) en distintos
  // momentos del ciclo de vida del Provider, para contrastar contra
  // useChatRealtime.ts (que sí recibe messages INSERT, confirmado en
  // C4-G8.5X) — ver hipótesis de carrera cliente/servidor de C4-G8.5V.
  // Nunca imprime el JWT, solo si existe.
  const tokenDiagnosticRanRef = useRef(false);
  useEffect(() => {
    if (!userId || tokenDiagnosticRanRef.current) return;
    tokenDiagnosticRanRef.current = true;

    const supabase = createClient();

    // eslint-disable-next-line no-console -- C4-G8.5W: diagnóstico temporal, retirar tras obtener evidencia
    console.log("[C4-G8.5W TEMP] accessTokenValue at mount", {
      hasToken: Boolean((supabase.realtime as any).accessTokenValue),
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // eslint-disable-next-line no-console -- C4-G8.5W TEMP
      console.log("[C4-G8.5W TEMP] auth event", {
        event,
        timestamp: new Date().toISOString(),
      });
    });

    const timeoutId = setTimeout(() => {
      // eslint-disable-next-line no-console -- C4-G8.5W TEMP
      console.log("[C4-G8.5W TEMP] accessTokenValue after 3s", {
        hasToken: Boolean((supabase.realtime as any).accessTokenValue),
      });
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [userId]);

  // Canal 1 — notifications. Sin cambios de arquitectura respecto a antes
  // de C4-G8.5R: sigue siendo el único canal `user:{userId}` de la app.
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const notificationsChannel = supabase.channel(`user:${userId}`);

    notificationsChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const n = payload.new as Notification;
        setUnreadCount((c) => c + 1);
        listenersRef.current.forEach((handler) => handler(n));
      }
    );

    // eslint-disable-next-line no-console -- C4-G8.5R: diagnóstico temporal, retirar tras obtener evidencia
    console.log("[C4-G8.5R TEMP] notifications channel created");

    notificationsChannel.subscribe((status, err) => {
      // eslint-disable-next-line no-console -- C4-G8.5R TEMP
      console.log("[C4-G8.5R TEMP] notifications subscribe status", status, err ?? "");
      setIsConnected(status === "SUBSCRIBED");
    });

    return () => {
      supabase.removeChannel(notificationsChannel);
      setIsConnected(false);
    };
  }, [userId]);

  // Canal 2 — messages (Fase C4-G8.5R, experimental/temporal). Canal
  // independiente del de notifications, topic distinto (`messages:{userId}`)
  // para no compartir bindings con el canal 1. Sin `filter`: RLS
  // (messages_select_participant) es quien decide qué filas llegan, igual
  // que en useChatRealtime.ts. Nunca se registra para admins.
  useEffect(() => {
    if (!userId || isAdmin) return;

    const supabase = createClient();
    const messagesChannel = supabase.channel(`messages:${userId}`);

    // eslint-disable-next-line no-console -- C4-G8.5R: diagnóstico temporal, retirar tras obtener evidencia
    console.log("[C4-G8.5R TEMP] messages channel created", {
      topic: `messages:${userId}`,
      userId,
      isAdmin,
    });

    messagesChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new as Message;
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] messages INSERT received", {
          messageId: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          userId,
        });
        if (isOwnMessage(msg, userId)) {
          // eslint-disable-next-line no-console -- C4-G8.5R TEMP
          console.log("[C4-G8.5R TEMP] own message ignored", {
            messageId: msg.id,
            senderId: msg.sender_id,
            userId,
          });
          return; // nunca refrescar por mensajes propios
        }
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] message from another user", {
          messageId: msg.id,
          conversationId: msg.conversation_id,
        });
        // eslint-disable-next-line no-console -- C4-G8.5R TEMP
        console.log("[C4-G8.5R TEMP] messages listener executed", {
          listeners: messageListenersRef.current.size,
        });
        messageListenersRef.current.forEach((handler) => handler(msg));
      }
    );

    messagesChannel.subscribe((status, err) => {
      // eslint-disable-next-line no-console -- C4-G8.5R TEMP
      console.log("[C4-G8.5R TEMP] messages subscribe status", status, err ?? "");
      if (status === "SUBSCRIBED") {
        // eslint-disable-next-line no-console -- C4-G8.5W TEMP
        console.log("[C4-G8.5W TEMP] accessTokenValue at SUBSCRIBED", {
          hasToken: Boolean((supabase.realtime as any).accessTokenValue),
        });
      }
    });

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [userId, isAdmin]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, isConnected, bumpUnread, setUnreadCount, subscribe, subscribeToNewMessages }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotificationsContext debe usarse dentro de <NotificationsProvider>");
  }
  return ctx;
}
