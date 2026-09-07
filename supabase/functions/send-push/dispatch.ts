// FASE P1-B2.5.1 — orquestación del despacho, extraída de index.ts para
// poder probarla de verdad con vitest (sin Deno): recibe el cliente admin
// y `sendWebPush` como dependencias inyectadas, en vez de leerlos de
// `Deno.env`/importarlos directamente. `index.ts` (el entrypoint Deno
// real) es ahora una envoltura delgada que arma estas dependencias y
// llama a `dispatchReminderPush()`.
//
// Contrato de reintento (decisión de v1, ver diseño P1-B2.5/P1-B2.5.1):
// el UPDATE condicional (`push_dispatched_at IS NULL`) sigue siendo el
// ÚNICO mecanismo de exclusión concurrente — nunca se debilita. Lo que
// cambia respecto a P1-B2.5 es que un fallo RECUPERABLE después de
// obtener el claim (lectura de subscriptions, envío total o parcial,
// una excepción no controlada) libera el claim (`push_dispatched_at =
// NULL`) antes de responder con un HTTP no-2xx, para que una invocación
// futura pueda reclamar la notification de nuevo. Trade-off explícito:
// un reintento puede reenviar a una suscripción que ya recibió el push
// en un intento parcialmente exitoso (duplicado ocasional) — se acepta
// deliberadamente sobre el riesgo de perder el recordatorio para
// siempre.

import {
  buildPushPayload,
  shouldRemoveSubscription,
  shouldReleaseClaim,
  wasAlreadyDispatched,
  type NotificationRow,
  type PushSubscriptionRow,
} from "./logic.ts";
import type { SendWebPushParams, VapidConfig } from "./webpush.ts";

/**
 * Subconjunto mínimo de la API de supabase-js realmente usado aquí —
 * deliberadamente laxo (no intenta replicar el tipado completo y
 * encadenable de supabase-js, que mezcla builders "thenable" con
 * métodos adicionales de forma difícil de tipar con precisión). Tanto
 * el cliente real (Deno, `createClient()` de `@supabase/supabase-js`)
 * como el mock de test (Node/vitest) son estructuralmente compatibles
 * con esto en la práctica — cada método usado abajo (`update().eq()`,
 * `update().eq().is().select()`, `select().eq()`, `delete().eq()`)
 * termina siendo un objeto "thenable" (`{data, error}` / `{error}`).
 */
export type DispatchAdminClient = { from(table: string): AdminTableBuilder };
// eslint/next lint no escanean `supabase/functions` (excluido del proyecto
// Next.js) — este `any` deliberado documenta que no se intenta replicar
// el tipado completo de supabase-js, no un descuido.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminTableBuilder = any;

export interface DispatchDeps {
  admin: DispatchAdminClient;
  /** `null` cuando VAPID no está configurada — se trata como fallo recuperable (libera el claim). */
  vapid: VapidConfig | null;
  sendWebPush(params: SendWebPushParams): Promise<Response>;
}

export interface DispatchResultBody {
  ok: boolean;
  sent?: number;
  failed?: number;
  removed?: number;
  alreadyDispatched?: boolean;
  error?: string;
}

export interface DispatchResult {
  status: number;
  body: DispatchResultBody;
}

async function releaseClaim(admin: DispatchAdminClient, notificationId: string): Promise<void> {
  const { error } = await admin.from("notifications").update({ push_dispatched_at: null }).eq("id", notificationId);
  if (error) {
    // No hay nada más que hacer si ni siquiera se puede liberar el claim
    // — se registra para observabilidad; la notification queda marcada
    // (peor caso: no se reintenta hasta una intervención manual, pero no
    // se pierde el registro del intento).
    console.error("[send-push] no se pudo liberar el claim tras un fallo", { notificationId });
  }
}

/**
 * Orquesta el despacho completo de UNA notification ya releída y
 * confirmada como `type === 'reminder'` (esa comprobación vive en
 * index.ts, antes de llamar aquí). Implementa el claim atómico +
 * liberación en fallo descritos arriba.
 */
export async function dispatchReminderPush(
  notification: NotificationRow,
  deps: DispatchDeps
): Promise<DispatchResult> {
  const { admin } = deps;

  // Claim atómico — único mecanismo de exclusión concurrente. No se toca.
  const { data: dispatchRows, error: dispatchError } = await admin
    .from("notifications")
    .update({ push_dispatched_at: new Date().toISOString() })
    .eq("id", notification.id)
    .is("push_dispatched_at", null)
    .select("id");

  if (dispatchError) {
    return { status: 500, body: { ok: false, error: "dispatch_marking_failed" } };
  }
  if (wasAlreadyDispatched(dispatchRows as unknown[] | null)) {
    return { status: 200, body: { ok: true, sent: 0, failed: 0, removed: 0, alreadyDispatched: true } };
  }

  // A partir de aquí YA tenemos el claim — cualquier salida de esta
  // función a partir de este punto debe decidir explícitamente si lo
  // conserva (éxito completo) o lo libera (cualquier fallo recuperable).
  try {
    const { data: subscriptionRows, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notification.user_id);

    if (subscriptionsError) {
      await releaseClaim(admin, notification.id);
      return { status: 500, body: { ok: false, error: "subscriptions_lookup_failed" } };
    }

    const subscriptions = (subscriptionRows as PushSubscriptionRow[] | null) ?? [];
    if (subscriptions.length === 0) {
      // Nada que enviar — no es una falla, no hay razón para reintentar.
      return { status: 200, body: { ok: true, sent: 0, failed: 0, removed: 0 } };
    }

    if (!deps.vapid) {
      await releaseClaim(admin, notification.id);
      return { status: 500, body: { ok: false, error: "server_misconfigured" } };
    }
    const vapid = deps.vapid;

    const payload = buildPushPayload(notification);

    let sent = 0;
    let failed = 0;
    let removed = 0;

    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        deps.sendWebPush({
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          payload,
          vapid,
        })
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const subscription = subscriptions[i];

      if (result.status === "rejected") {
        failed++;
        console.error("[send-push] fallo de red al enviar", { subscriptionId: subscription.id });
        continue;
      }

      const response = result.value;
      if (response.ok) {
        sent++;
        continue;
      }

      failed++;
      if (shouldRemoveSubscription(response.status)) {
        const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        if (deleteError) {
          console.error("[send-push] no se pudo eliminar subscription inválida", { subscriptionId: subscription.id });
        } else {
          removed++;
        }
      } else {
        console.error("[send-push] push service respondió con error", {
          subscriptionId: subscription.id,
          status: response.status,
        });
      }
    }

    if (shouldReleaseClaim(failed)) {
      await releaseClaim(admin, notification.id);
      return { status: 502, body: { ok: false, sent, failed, removed, error: "push_delivery_incomplete" } };
    }

    return { status: 200, body: { ok: true, sent, failed, removed } };
  } catch {
    // Caso E — cualquier excepción no controlada después del claim libera
    // el claim antes de responder, nunca deja la notification marcada
    // indefinidamente por un error inesperado.
    console.error("[send-push] excepción no controlada tras el claim", { notificationId: notification.id });
    await releaseClaim(admin, notification.id);
    return { status: 500, body: { ok: false, error: "internal_error" } };
  }
}
