"use client";

import { useCallback, useEffect, useState } from "react";
import { savePushSubscription, deletePushSubscription } from "@/lib/actions/push";

/**
 * FASE P1-B1 (Web Push) — únicamente el lado de suscripción del
 * navegador: comprobar soporte, pedir permiso, crear/eliminar la
 * PushSubscription y persistirla vía push.ts (0057). Nunca envía un
 * push — eso vive en una Edge Function futura, fuera de este alcance.
 *
 * El permiso NUNCA se solicita automáticamente: `subscribe()` solo debe
 * llamarse desde un handler de click/acción explícita del usuario (los
 * navegadores ya rechazan `Notification.requestPermission()` fuera de un
 * gesto de usuario, pero además es la práctica correcta en sí misma).
 */

export type PushSupportState = "checking" | "supported" | "unsupported";

export interface UsePushSubscriptionResult {
  /** "checking" solo en el primer render (SSR/hidratación); nunca queda así en el cliente. */
  supported: PushSupportState;
  permission: NotificationPermission | "unknown";
  subscribed: boolean;
  isPending: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const [supported, setSupported] = useState<PushSupportState>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(isSupported ? "supported" : "unsupported");
    if (isSupported) setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (supported !== "supported") return;
    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch {
        // Service worker todavía no listo — se resuelve al intentar subscribe().
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (supported !== "supported") {
      setError("Tu navegador no soporta notificaciones push.");
      return false;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      // Esperado hasta P1-B3 (VAPID todavía no configurada en ningún
      // entorno) — nunca se trata como un error de la app.
      setError("Las notificaciones push todavía no están disponibles.");
      return false;
    }

    setIsPending(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setError("Debes conceder el permiso de notificaciones para activarlas.");
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("No se pudo completar la suscripción.");
        return false;
      }

      const result = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });

      if (result.error) {
        setError(result.error);
        return false;
      }

      setSubscribed(true);
      return true;
    } catch {
      setError("No se pudo activar las notificaciones push.");
      return false;
    } finally {
      setIsPending(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (supported !== "supported") return false;

    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setSubscribed(false);
        return true;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const result = await deletePushSubscription(endpoint);
      if (result.error) {
        setError(result.error);
        return false;
      }

      setSubscribed(false);
      return true;
    } catch {
      setError("No se pudo desactivar las notificaciones push.");
      return false;
    } finally {
      setIsPending(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, isPending, error, subscribe, unsubscribe };
}
