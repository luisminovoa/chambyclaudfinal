import { describe, expect, it, vi, beforeEach } from "vitest";
import { dispatchReminderPush, type DispatchAdminClient } from "./dispatch";
import type { NotificationRow } from "./logic";

/**
 * FASE P1-B2.5.1 — cobertura EJECUTABLE de la orquestación real de
 * `send-push` (claim/liberación/reintento), extraída a dispatch.ts
 * específicamente para poder probarla sin Deno. A diferencia de
 * logic.test.ts/webpush.test.ts (que prueban piezas aisladas), esta
 * suite ejercita el flujo COMPLETO tal como lo vería index.ts —
 * incluyendo el caso de una segunda invocación después de un fallo.
 */

interface NotifRow {
  id: string;
  user_id: string;
  push_dispatched_at: string | null;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface State {
  notifications: NotifRow[];
  subscriptions: SubRow[];
  subscriptionsReadError: string | null;
  claimUpdateError: string | null;
  releaseUpdateError: string | null;
  deletedSubscriptionIds: string[];
}

const state: State = {
  notifications: [],
  subscriptions: [],
  subscriptionsReadError: null,
  claimUpdateError: null,
  releaseUpdateError: null,
  deletedSubscriptionIds: [],
};

function resetState() {
  state.notifications = [];
  state.subscriptions = [];
  state.subscriptionsReadError = null;
  state.claimUpdateError = null;
  state.releaseUpdateError = null;
  state.deletedSubscriptionIds = [];
}

function matchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

const admin: DispatchAdminClient = {
  from(table: string) {
    if (table === "notifications") {
      return {
        update(payload: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return {
                // Usado por releaseClaim(): .update({...}).eq("id", id) — awaited directamente.
                then(resolve: (v: { error: unknown }) => void) {
                  if (state.releaseUpdateError) {
                    resolve({ error: { message: state.releaseUpdateError } });
                    return;
                  }
                  const row = state.notifications.find((n) => matchesFilters(n, filters));
                  if (row) Object.assign(row, payload);
                  resolve({ error: null });
                },
                // Usado por el claim: .eq("id", id).is("push_dispatched_at", null).select("id")
                is(col2: string, val2: unknown) {
                  filters[col2] = val2;
                  return {
                    select(_cols: string) {
                      return {
                        then(resolve: (v: { data: unknown[] | null; error: unknown }) => void) {
                          if (state.claimUpdateError) {
                            resolve({ data: null, error: { message: state.claimUpdateError } });
                            return;
                          }
                          const matches = state.notifications.filter((n) => matchesFilters(n, filters));
                          matches.forEach((n) => Object.assign(n, payload));
                          resolve({ data: matches.map((n) => ({ id: n.id })), error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
          return builder;
        },
      };
    }

    if (table === "push_subscriptions") {
      return {
        select(_cols: string) {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            then(resolve: (v: { data: SubRow[] | null; error: unknown }) => void) {
              if (state.subscriptionsReadError) {
                resolve({ data: null, error: { message: state.subscriptionsReadError } });
                return;
              }
              resolve({ data: state.subscriptions.filter((s) => matchesFilters(s, filters)), error: null });
            },
          };
          return builder;
        },
        delete() {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            then(resolve: (v: { error: unknown }) => void) {
              const before = state.subscriptions.length;
              state.subscriptions = state.subscriptions.filter((s) => !matchesFilters(s, filters));
              if (state.subscriptions.length < before) {
                state.deletedSubscriptionIds.push(filters.id as string);
              }
              resolve({ error: null });
            },
          };
          return builder;
        },
      };
    }

    throw new Error(`tabla inesperada en el mock: ${table}`);
  },
};

const NOTIFICATION_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const VAPID = { publicKey: "pub", privateKey: "priv", subject: "mailto:soporte@chamby.pe" };

function makeNotification(): NotificationRow {
  return {
    id: NOTIFICATION_ID,
    user_id: USER_ID,
    type: "reminder",
    title: "Trabajo próximo",
    body: "Empieza en 1 hora",
    data: { jobId: "job-1" },
    job_id: "job-1",
  };
}

function makeSubscription(id: string): SubRow {
  return { id, user_id: USER_ID, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a" };
}

function ok() {
  return new Response(null, { status: 201 });
}
function fail(status: number) {
  return new Response(null, { status });
}

beforeEach(() => {
  resetState();
  state.notifications.push({ id: NOTIFICATION_ID, user_id: USER_ID, push_dispatched_at: null });
});

describe("dispatchReminderPush — Caso A: éxito completo", () => {
  it("N/N OK → conserva el claim, responde 200", async () => {
    state.subscriptions.push(makeSubscription("s1"), makeSubscription("s2"));
    const sendWebPush = vi.fn().mockResolvedValue(ok());

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, sent: 2, failed: 0, removed: 0 });
    expect(state.notifications[0].push_dispatched_at).not.toBeNull(); // claim conservado
  });

  it("0 subscriptions → éxito, conserva el claim (nada que reintentar)", async () => {
    const sendWebPush = vi.fn();
    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, sent: 0, failed: 0, removed: 0 });
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(state.notifications[0].push_dispatched_at).not.toBeNull();
  });
});

describe("dispatchReminderPush — Caso B: fallo total", () => {
  it("N/N fallan → libera el claim, responde no-2xx", async () => {
    state.subscriptions.push(makeSubscription("s1"), makeSubscription("s2"));
    const sendWebPush = vi.fn().mockResolvedValue(fail(500));

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).not.toBe(200);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.body.ok).toBe(false);
    expect(result.body.sent).toBe(0);
    expect(result.body.failed).toBe(2);
    expect(state.notifications[0].push_dispatched_at).toBeNull(); // claim liberado — disponible para retry
  });
});

describe("dispatchReminderPush — Caso C: fallo parcial", () => {
  it("2 OK + 1 falla → libera el claim igual, responde no-2xx (duplicado ocasional aceptado)", async () => {
    state.subscriptions.push(makeSubscription("s1"), makeSubscription("s2"), makeSubscription("s3"));
    const sendWebPush = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail(500));

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).not.toBe(200);
    expect(result.body).toMatchObject({ ok: false, sent: 2, failed: 1 });
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });

  it("una subscription con 404 se elimina y cuenta como removed, pero el claim igual se libera por el fallo", async () => {
    state.subscriptions.push(makeSubscription("s1"), makeSubscription("s2"));
    const sendWebPush = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail(404));

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.body).toMatchObject({ sent: 1, failed: 1, removed: 1 });
    expect(state.subscriptions.map((s) => s.id)).toEqual(["s1"]);
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });

  it("410 también elimina la subscription", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    const sendWebPush = vi.fn().mockResolvedValue(fail(410));

    await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(state.subscriptions).toHaveLength(0);
  });

  it("un 5xx NO elimina la subscription", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    const sendWebPush = vi.fn().mockResolvedValue(fail(503));

    await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(state.subscriptions).toHaveLength(1);
  });

  it("un rechazo de red (fetch throw) cuenta como fallo y libera el claim", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    const sendWebPush = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.body).toMatchObject({ sent: 0, failed: 1 });
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });
});

describe("dispatchReminderPush — Caso D: falla la lectura de subscriptions", () => {
  it("libera el claim, responde no-2xx, nunca intenta enviar", async () => {
    state.subscriptionsReadError = "connection reset";
    const sendWebPush = vi.fn();

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).not.toBe(200);
    expect(result.body.ok).toBe(false);
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });
});

describe("dispatchReminderPush — VAPID no configurada (fallo recuperable)", () => {
  it("libera el claim, responde no-2xx, nunca intenta enviar", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    const sendWebPush = vi.fn();

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: null, sendWebPush });

    expect(result.status).not.toBe(200);
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });
});

describe("dispatchReminderPush — Caso E: excepción no controlada tras el claim", () => {
  it("libera el claim y responde no-2xx en vez de propagar la excepción", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    // sendWebPush "revienta" de una forma que no captura Promise.allSettled
    // per-subscription (aquí forzamos el error en el propio array.map,
    // simulando un error inesperado ajeno al envío en sí):
    const sendWebPush = vi.fn(() => {
      throw new TypeError("boom inesperado");
    });

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result.status).not.toBe(200);
    expect(result.body).toEqual({ ok: false, error: "internal_error" });
    expect(state.notifications[0].push_dispatched_at).toBeNull();
  });
});

describe("dispatchReminderPush — notification ya despachada", () => {
  it("no lee subscriptions ni intenta enviar nada", async () => {
    state.notifications[0].push_dispatched_at = new Date().toISOString();
    state.subscriptions.push(makeSubscription("s1"));
    const sendWebPush = vi.fn();

    const result = await dispatchReminderPush(makeNotification(), { admin, vapid: VAPID, sendWebPush });

    expect(result).toEqual({ status: 200, body: { ok: true, sent: 0, failed: 0, removed: 0, alreadyDispatched: true } });
    expect(sendWebPush).not.toHaveBeenCalled();
  });
});

describe("dispatchReminderPush — una segunda invocación tras un fallo puede reclamar de nuevo", () => {
  it("primera invocación falla y libera el claim; la segunda vuelve a reclamarlo y procesa", async () => {
    state.subscriptions.push(makeSubscription("s1"));

    const first = await dispatchReminderPush(makeNotification(), {
      admin,
      vapid: VAPID,
      sendWebPush: vi.fn().mockResolvedValue(fail(500)),
    });
    expect(first.status).not.toBe(200);
    expect(state.notifications[0].push_dispatched_at).toBeNull();

    const secondSendWebPush = vi.fn().mockResolvedValue(ok());
    const second = await dispatchReminderPush(makeNotification(), {
      admin,
      vapid: VAPID,
      sendWebPush: secondSendWebPush,
    });

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, sent: 1, failed: 0, removed: 0 });
    expect(secondSendWebPush).toHaveBeenCalledTimes(1);
    expect(state.notifications[0].push_dispatched_at).not.toBeNull();
  });
});

describe("dispatchReminderPush — falla la propia liberación del claim", () => {
  it("registra el error pero igual responde no-2xx (no lo oculta ni lo convierte en éxito)", async () => {
    state.subscriptions.push(makeSubscription("s1"));
    state.releaseUpdateError = "db unreachable";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchReminderPush(makeNotification(), {
      admin,
      vapid: VAPID,
      sendWebPush: vi.fn().mockResolvedValue(fail(500)),
    });

    expect(result.status).not.toBe(200);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
