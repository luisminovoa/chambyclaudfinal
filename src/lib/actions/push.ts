"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

/**
 * FASE P1-B1 (Web Push) — únicamente el lado de suscripción: guardar o
 * eliminar la PushSubscription del navegador del usuario autenticado en
 * `push_subscriptions` (0057). Nunca envía un push desde aquí — eso vive
 * en la futura Edge Function `send-push` (fase posterior, ver diseño
 * P1-A). No toca 0056/send_job_reminders()/el cron `chamby-job-
 * reminders-1h` en absoluto.
 *
 * FASE P1-B1.2 (corrección de BLOCKER de seguridad): este archivo NO usa
 * `createAdminClient()` en ningún punto. La versión original de
 * `savePushSubscription()` reasignaba automáticamente un `endpoint` ya
 * registrado por otra cuenta (caso "navegador compartido") usando el
 * cliente admin para borrar la fila ajena — eso era un IDOR explotable:
 * `endpoint` es un valor que el llamante puede enviar libremente (nada
 * prueba que lo haya obtenido de su propio `PushManager`), así que
 * cualquier usuario que conociera/adivinara el endpoint de otro podía
 * borrar su suscripción real. Decisión de producto para v1: la
 * reasignación entre cuentas queda FUERA de alcance — un conflicto de
 * `endpoint` ajeno nunca toca la fila de la otra cuenta, nunca se
 * distingue de otros fallos en la respuesta, y se resuelve enteramente
 * con el cliente de sesión (nunca con privilegios de servicio).
 */

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 512;
// Claves del protocolo Web Push (p256dh/auth): base64url, sin exigir un
// largo exacto (varía levemente entre navegadores/push services) pero
// acotado para rechazar basura/payloads desproporcionados.
const KEY_RE = /^[A-Za-z0-9_-]{16,255}$/;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

/**
 * Valida la forma de una PushSubscription tal como la entrega
 * `PushSubscription.toJSON()` en el navegador. Rechaza cualquier payload
 * incompleto o con datos fuera de forma — nunca intenta "arreglar" ni
 * completar campos faltantes.
 */
function validateSubscription(input: unknown): input is PushSubscriptionInput {
  if (!input || typeof input !== "object") return false;
  const { endpoint, keys } = input as Record<string, unknown>;

  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return false;
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
  } catch {
    return false;
  }

  if (!keys || typeof keys !== "object") return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (typeof p256dh !== "string" || !KEY_RE.test(p256dh)) return false;
  if (typeof auth !== "string" || !KEY_RE.test(auth)) return false;

  return true;
}

async function getAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Guarda (o refresca) la PushSubscription del navegador actual. `user_id`
 * siempre se toma de `auth.uid()` — el tipo de entrada ni siquiera acepta
 * un `userId`, y la RLS de 0057 (`WITH CHECK user_id = auth.uid()`)
 * respalda esto de forma estructural, no solo aquí.
 *
 * `endpoint` es UNIQUE a nivel de tabla. Tres casos:
 * 1) Ya existe una fila PROPIA con este endpoint (mismo navegador
 *    re-suscribiéndose, o una petición concurrente propia que ya ganó la
 *    carrera) → se refresca in place / se trata como éxito idempotente.
 * 2) Endpoint nunca visto → INSERT directo.
 * 3) El INSERT choca contra el UNIQUE (23505). Nunca se asume por qué:
 *    se vuelve a comprobar, con el MISMO cliente de sesión (nunca admin),
 *    si la fila que ganó la carrera es la propia — si lo es, éxito
 *    idempotente (cubre la única carrera legítima: dos pestañas propias
 *    suscribiéndose a la vez). Si el SELECT no la ve, solo puede
 *    significar que el endpoint pertenece a OTRA cuenta — la RLS
 *    (`push_subscriptions_select_own`) hace esa fila estructuralmente
 *    invisible para esta sesión, así que ni siquiera hace falta
 *    comprobarlo "a mano": nunca se toca, nunca se borra, nunca se
 *    reasigna, y la respuesta es el mismo error genérico que cualquier
 *    otro fallo — no hay forma de distinguir desde afuera "el endpoint es
 *    de otro usuario" de cualquier otro motivo de fallo.
 */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  if (!validateSubscription(input)) {
    return { error: "Suscripción de notificaciones inválida." };
  }

  const userAgent =
    typeof input.userAgent === "string" ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;

  const payload = {
    user_id: user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase
    .from("push_subscriptions")
    .update(payload)
    .eq("endpoint", input.endpoint)
    .eq("user_id", user.id)
    .select("id");

  if (updateError) return { error: "No se pudo guardar tu suscripción." };
  if (updated && updated.length > 0) return { success: true };

  const { error: insertError } = await supabase.from("push_subscriptions").insert(payload);
  if (!insertError) return { success: true };

  if (insertError.code === "23505") {
    const { data: ownRow } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", input.endpoint)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownRow) return { success: true };
    return { error: "No se pudo guardar tu suscripción." };
  }

  return { error: "No se pudo guardar tu suscripción." };
}

/**
 * Elimina la suscripción del navegador actual. El propio DELETE ya viene
 * acotado por `.eq("user_id", user.id)` — redundante con la RLS
 * (`push_subscriptions_delete_own`, `USING user_id = auth.uid()`), pero
 * deja explícito en el código, sin depender solo de la base de datos,
 * que esta acción nunca puede afectar la fila de otra cuenta.
 *
 * FASE P1-B1.2: la versión anterior hacía un SELECT previo para poder
 * distinguir "no existe" de "es de otro usuario" y devolver "Sin
 * permiso." en el segundo caso — eso es un oráculo de existencia (revela
 * que ALGÚN usuario tiene registrado ese endpoint). Además, ese SELECT
 * corría con el cliente de sesión, sujeto a la misma RLS de solo-lectura-
 * propia — así que en Postgres real una fila ajena ya era invisible para
 * él y la rama "Sin permiso." nunca podía dispararse de todas formas.
 * Ahora la operación es siempre idempotente: "no existía" y "era de otro
 * usuario" terminan en la misma respuesta de éxito, porque ambas
 * significan lo mismo desde el punto de vista del llamante — no hay
 * ninguna suscripción PROPIA en ese endpoint — y no hay forma de que la
 * respuesta revele si el endpoint pertenece a alguien más.
 */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { error: "Endpoint inválido." };
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo eliminar tu suscripción." };

  return { success: true };
}
