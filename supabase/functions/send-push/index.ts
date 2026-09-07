// FASE P1-B2.2/P1-B2.5/P1-B2.5.1 — Edge Function `send-push`.
//
// NO DESPLEGADA TODAVÍA. Código únicamente, pendiente de secrets/VAPID
// reales y de despliegue (P1-B2.4, aún no autorizada) según el plan de
// P1-B2.1. Este archivo requiere el runtime Deno (Deno.serve/Deno.env,
// import remoto de supabase-js) y no puede ejecutarse ni type-checkearse
// en este entorno de desarrollo (sin `deno` instalado) — por eso
// `supabase/functions` está excluido del `tsconfig.json` raíz (Next.js/
// Node). Por esa misma razón, este archivo es deliberadamente delgado:
// toda la orquestación real del despacho (claim/liberación/reintento)
// vive en `dispatch.ts` (portable, sin Deno), que sí está probada de
// verdad con vitest — ver dispatch.test.ts.
//
// Contrato de entrada: exclusivamente `{ notification_id: uuid }`.
// Cualquier otro campo del body (user_id, job_id, title, body,
// subscriptions...) se ignora estructuralmente: extractNotificationId()
// (logic.ts) solo extrae ese único campo — el resto nunca se lee.
//
// Autenticación: header `x-chamby-push-secret`, comparado contra
// Deno.env.get("CHAMBY_PUSH_SECRET"). NUNCA se usa el JWT de usuario
// (Authorization: Bearer ...), `service_role` ni el `anon key` como
// mecanismo de autorización del CALLER — el único llamante legítimo es
// el futuro trigger de Postgres (P1-B2.6, aún no creado), vía pg_net, que
// obtendrá este mismo secreto desde Supabase Vault en el momento de la
// llamada (nunca hardcodeado en una migración). `service_role` se usa
// DESPUÉS de validar este secreto, únicamente para leer notifications/
// push_subscriptions, marcar/liberar el despacho y borrar suscripciones
// 404/410 — nunca para decidir si atender la petición.
//
// IDEMPOTENCIA Y RETRY (P1-B2.5 → corregido en P1-B2.5.1): el UPDATE
// condicional (`push_dispatched_at IS NULL`) sigue siendo el ÚNICO
// mecanismo de exclusión concurrente. La corrección de P1-B2.5.1 es que
// un fallo recuperable DESPUÉS de obtener el claim (lectura de
// subscriptions, envío total o parcialmente fallido, una excepción no
// controlada) libera el claim antes de responder con un HTTP no-2xx —
// ver dispatch.ts para el detalle completo y el razonamiento de cada
// caso. Solo un despacho sin ninguna falla conserva el claim.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractNotificationId, isValidUuid, secretsMatch, REMINDER_TYPE, type NotificationRow } from "./logic.ts";
import { sendWebPush } from "./webpush.ts";
import { dispatchReminderPush } from "./dispatch.ts";

// `Deno` es un global provisto por el runtime real de Supabase Edge
// Functions — no se declara aquí a propósito (este archivo está excluido
// del tsconfig raíz de Next.js/Node, que no conoce los tipos de Deno; el
// propio editor de Supabase / `deno check` los provee al desplegar).

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 1) Secreto de invocación — ANTES de leer/parsear cualquier otra cosa.
  const expectedSecret = Deno.env.get("CHAMBY_PUSH_SECRET");
  const providedSecret = req.headers.get("x-chamby-push-secret");
  if (!secretsMatch(providedSecret, expectedSecret)) {
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  // 2) `notification_id` — único campo de entrada aceptado.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }
  const notificationId = extractNotificationId(rawBody);
  if (!isValidUuid(notificationId)) {
    return jsonResponse(400, { ok: false, error: "invalid_notification_id" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    // Configuración del propio entorno, nunca del caller — no revelar detalle.
    return jsonResponse(500, { ok: false, error: "server_misconfigured" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 3) Releer la fila REAL de `notifications` — nunca confiar en nada más
  //    que el request pudiera haber incluido.
  const { data: notificationRow, error: notificationError } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, data, job_id")
    .eq("id", notificationId)
    .maybeSingle();

  if (notificationError) {
    return jsonResponse(500, { ok: false, error: "notification_lookup_failed" });
  }
  const notification = notificationRow as NotificationRow | null;
  if (!notification) {
    return jsonResponse(404, { ok: false, error: "notification_not_found" });
  }

  // 4) Único tipo en alcance en esta fase — ver diseño P1-A/P1-B2.1.
  if (notification.type !== REMINDER_TYPE) {
    return jsonResponse(409, { ok: false, error: "unsupported_notification_type" });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapid =
    vapidPublicKey && vapidPrivateKey && vapidSubject
      ? { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject }
      : null;

  // 5) Toda la orquestación de claim/subscriptions/envío/liberación vive
  //    en dispatch.ts — ver ese archivo (y dispatch.test.ts) para el
  //    detalle probado de cada caso.
  const result = await dispatchReminderPush(notification, { admin, vapid, sendWebPush });
  return jsonResponse(result.status, result.body);
});
