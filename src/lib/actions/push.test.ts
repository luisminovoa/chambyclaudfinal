import { describe, expect, it, vi, beforeEach } from "vitest";
import { savePushSubscription, deletePushSubscription } from "./push";

/**
 * FASE P1-B1 — cobertura de las Server Actions de suscripción Web Push.
 * Igual que calendar.test.ts/jobs.test.ts: esto NO prueba las policies
 * RLS de 0057 (verificación empírica pendiente contra Postgres real,
 * fuera de esta fase) — fija que la capa TypeScript valida el payload y
 * nunca confía en un `user_id`/ownership provisto por el llamante antes
 * de tocar la base de datos.
 *
 * FASE P1-B1.2: el mock de `@/lib/supabase/server` deliberadamente ya NO
 * expone `createAdminClient` — push.ts no debe usarlo nunca más (BLOCKER
 * de P1-B1.1: la reasignación cross-usuario vía admin bypass permitía a
 * cualquier usuario borrar la `push_subscription` de otro conociendo su
 * `endpoint`). Si push.ts volviera a importar/llamar `createAdminClient`,
 * estos tests fallarían de inmediato al no existir esa función en el mock.
 */

interface Row {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  updated_at?: string;
}

interface State {
  user: { id: string } | null;
  rows: Row[];
  nextId: number;
}

const state: State = { user: null, rows: [], nextId: 1 };

function resetState() {
  state.user = null;
  state.rows = [];
  state.nextId = 1;
}

function matches(row: Row, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
}

/** El mock no simula RLS (eso vive en supabase/tests/*.sql) — solo simula
 * cómo reacciona Postgres a los filtros/valores que el cliente de sesión
 * manda. push.ts ya no usa ningún cliente admin (P1-B1.2). */
function makePushSubscriptionsTable() {
  return {
    update: (payload: Record<string, unknown>) => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        select(_cols: string) {
          return {
            then(resolve: (v: { data: Row[]; error: null }) => void) {
              const rows = state.rows.filter((r) => matches(r, filters));
              rows.forEach((r) => Object.assign(r, payload));
              resolve({ data: rows, error: null });
            },
          };
        },
      };
      return builder;
    },
    insert: async (payload: Record<string, unknown>) => {
      const endpoint = payload.endpoint as string;
      if (state.rows.some((r) => r.endpoint === endpoint)) {
        return { error: { code: "23505", message: "duplicate key value" } };
      }
      state.rows.push({ id: `row-${state.nextId++}`, ...(payload as Omit<Row, "id">) });
      return { error: null };
    },
    select: (_cols: string) => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          const row = state.rows.find((r) => matches(r, filters));
          return { data: row ?? null, error: null };
        },
      };
      return builder;
    },
    delete: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        then(resolve: (v: { error: null }) => void) {
          state.rows = state.rows.filter((r) => !matches(r, filters));
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== "push_subscriptions") throw new Error(`tabla inesperada en el mock: ${table}`);
      return makePushSubscriptionsTable();
    },
  }),
  // Deliberadamente SIN createAdminClient — ver docblock de arriba.
}));

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VALID_ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const VALID_P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u";
const VALID_AUTH = "tBHItJI5svbpez7KI4CCXg";

beforeEach(() => {
  resetState();
});

describe("savePushSubscription", () => {
  it("usuario no autenticado → error, no escribe nada", async () => {
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("endpoint no-https → rechazado", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: "http://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("endpoint mal formado (no es una URL) → rechazado", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: "no-es-una-url",
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("p256dh vacío → rechazado", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: "", auth: VALID_AUTH },
    });
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("auth con caracteres fuera de base64url → rechazado", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: "no valido!!" },
    });
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("payload sin `keys` → rechazado", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
    } as unknown as Parameters<typeof savePushSubscription>[0]);
    expect(result.error).toBeTruthy();
    expect(state.rows).toHaveLength(0);
  });

  it("suscripción válida, endpoint nuevo → se inserta con user_id del propio caller", async () => {
    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      userAgent: "Mozilla/5.0 test",
    });
    expect(result.success).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].user_id).toBe(USER_A);
    expect(state.rows[0].endpoint).toBe(VALID_ENDPOINT);
  });

  it("un userId en el payload es ignorado — siempre se usa auth.uid()", async () => {
    state.user = { id: USER_A };
    await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      // @ts-expect-error — intento deliberado de inyectar un user_id ajeno
      userId: USER_B,
    });
    expect(state.rows[0].user_id).toBe(USER_A);
  });

  it("re-suscripción propia (mismo endpoint, mismo usuario) → refresca in place, no duplica fila", async () => {
    state.user = { id: USER_A };
    await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: "dGJISXRKSTVzdmJwZXo3S0k0Q0NYZw" },
    });
    expect(result.success).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].auth).toBe("dGJISXRKSTVzdmJwZXo3S0k0Q0NYZw");
  });

  it("BLOCKER P1-B1.1 corregido: endpoint perteneciente a OTRO usuario → rechazado, la fila de B queda intacta, no se crea fila para A", async () => {
    state.user = { id: USER_B };
    await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });
    const bRowBefore = { ...state.rows[0] };

    state.user = { id: USER_A };
    const result = await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      // A no conoce las claves reales de B — solo el endpoint (adivinado
      // u observado por algún medio ajeno a esta Server Action). El
      // contenido exacto de las claves es irrelevante para este caso: lo
      // que se prueba es el conflicto de endpoint, no las claves en sí.
      keys: { p256dh: VALID_P256DH, auth: "dGJISXRKSTVzdmJwZXo3S0k0Q0NYZw" },
    });

    // Falla de forma segura/no-op: nunca "success" para A.
    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();

    // La fila de B permanece exactamente igual — ni borrada, ni tocada,
    // ni reasignada. Solo debe existir esa única fila en todo el mock.
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toEqual(bRowBefore);
    expect(state.rows[0].user_id).toBe(USER_B);

    // No se creó ninguna fila para A.
    expect(state.rows.some((r) => r.user_id === USER_A)).toBe(false);
  });
});

describe("deletePushSubscription", () => {
  it("usuario no autenticado → error", async () => {
    const result = await deletePushSubscription(VALID_ENDPOINT);
    expect(result.error).toBeTruthy();
  });

  it("endpoint inexistente → éxito idempotente, sin error", async () => {
    state.user = { id: USER_A };
    const result = await deletePushSubscription(VALID_ENDPOINT);
    expect(result.success).toBe(true);
  });

  it("elimina una suscripción propia", async () => {
    state.user = { id: USER_A };
    await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });

    const result = await deletePushSubscription(VALID_ENDPOINT);
    expect(result.success).toBe(true);
    expect(state.rows).toHaveLength(0);
  });

  it("delete ajeno → rechazado en la práctica: la fila de la víctima nunca se borra, aunque la respuesta sea el mismo éxito genérico que un endpoint inexistente", async () => {
    state.user = { id: USER_A };
    await savePushSubscription({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });

    // FASE P1-B1.2: ya no hay un SELECT previo que distinga "no existe" de
    // "es de otro" (ese distingo era el oráculo de existencia señalado en
    // P1-B1.1) — el DELETE mismo viene acotado por `user_id`, así que B
    // nunca puede afectar la fila de A. La respuesta es éxito idempotente
    // en ambos casos; lo que importa para la seguridad es que la fila de
    // A sobrevive intacta.
    state.user = { id: USER_B };
    const result = await deletePushSubscription(VALID_ENDPOINT);

    expect(result.success).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].user_id).toBe(USER_A);
    expect(state.rows[0].endpoint).toBe(VALID_ENDPOINT);
  });
});
