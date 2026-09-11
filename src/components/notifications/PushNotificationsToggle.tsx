"use client";

import { Bell, BellRing, Loader2 } from "lucide-react";
import { usePushSubscription } from "@/lib/push/usePushSubscription";

/**
 * FASE P1-B2.16 — wiring del click al flujo real de suscripción,
 * extraído como función nombrada (en vez de un arrow inline) para poder
 * probar que el click invoca `subscribe()` sin simular un evento de
 * click real: este proyecto no usa jsdom/testing-library (ver
 * vitest.config.ts, `environment: "node"`), así que los tests de
 * componentes existentes (p.ej. BottomNavClient.test.tsx) verifican HTML
 * estático vía `renderToStaticMarkup`, no interacción de DOM. Ninguna
 * lógica de permisos/suscripción vive aquí — solo delega en la función
 * `subscribe` que ya provee el hook.
 */
export async function handleActivateClick(subscribe: () => Promise<boolean>): Promise<void> {
  await subscribe();
}

/**
 * FASE P1-B2.16 — único punto de la UI desde el que un usuario puede
 * activar Web Push. Vive dentro del panel de `NotificationBell` (el
 * único lugar de toda la navegación que ya habla de "Notificaciones",
 * visible tanto en escritorio como en móvil — a diferencia de
 * `UserMenu`, `NotificationBell` no es `hidden sm:block`) en vez de una
 * página o sistema de preferencias nuevo: Chamby no tiene hoy ninguna
 * página de "Configuración" (ver CLAUDE.md) y esta fase no introduce
 * una. Envuelve exclusivamente `usePushSubscription()` — sin llamar
 * `Notification.requestPermission()` ni `subscribe()` fuera de un click
 * explícito del usuario.
 */
export function PushNotificationsToggle() {
  const { supported, subscribed, isPending, error, subscribe } = usePushSubscription();

  if (supported === "checking") return null;

  if (supported === "unsupported") {
    return (
      <div className="border-b border-slate-100 px-4 py-2.5 text-xs text-ink-muted">
        Notificaciones push no disponibles en este dispositivo.
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-xs font-medium text-success-700">
        <BellRing className="h-3.5 w-3.5" aria-hidden />
        Notificaciones activadas
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <p className="mb-2 text-xs text-ink-muted">
        Activa las notificaciones para recibir avisos importantes de tus trabajos.
      </p>
      <button
        type="button"
        onClick={() => handleActivateClick(subscribe)}
        disabled={isPending}
        className="btn-primary !w-full !py-2 !text-xs disabled:opacity-60"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Activando…
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1.5">
            <Bell className="h-3.5 w-3.5" aria-hidden />
            Activar notificaciones
          </span>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
