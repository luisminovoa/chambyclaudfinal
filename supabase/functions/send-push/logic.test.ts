import { describe, expect, it } from "vitest";
import {
  isValidUuid,
  extractNotificationId,
  secretsMatch,
  buildPushPayload,
  shouldRemoveSubscription,
  wasAlreadyDispatched,
  REMINDER_TYPE,
  type NotificationRow,
} from "./logic";

/**
 * FASE P1-B2.2 — cobertura de la lógica pura de `send-push`. Corre bajo
 * vitest (Node) porque este entorno no tiene el runtime Deno instalado;
 * `logic.ts` se escribió deliberadamente sin ninguna dependencia de Deno
 * para que esto fuera posible. No prueba `index.ts` (el entrypoint real,
 * que sí requiere Deno) — ver REPORTE FINAL para el detalle de qué queda
 * verificado aquí y qué solo por revisión estática.
 */

function makeNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    type: REMINDER_TYPE,
    title: "Trabajo próximo",
    body: 'Tu trabajo "Carga y descarga" comienza en aproximadamente 1 hora.',
    data: { jobId: "33333333-3333-3333-3333-333333333333", reminderType: "1h" },
    job_id: "33333333-3333-3333-3333-333333333333",
    ...overrides,
  };
}

describe("isValidUuid", () => {
  it("acepta un UUID v4 válido", () => {
    expect(isValidUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("rechaza undefined", () => {
    expect(isValidUuid(undefined)).toBe(false);
  });

  it("rechaza un string que no es UUID", () => {
    expect(isValidUuid("no-es-un-uuid")).toBe(false);
  });

  it("rechaza un número", () => {
    expect(isValidUuid(12345)).toBe(false);
  });

  it("rechaza un UUID con longitud incorrecta", () => {
    expect(isValidUuid("11111111-1111-1111-1111-11111111111")).toBe(false);
  });
});

describe("extractNotificationId — test #3, #4, #8", () => {
  it("extrae notification_id de un body válido", () => {
    expect(extractNotificationId({ notification_id: "abc" })).toBe("abc");
  });

  it("devuelve undefined si falta notification_id (→ 400 en index.ts)", () => {
    expect(extractNotificationId({})).toBeUndefined();
  });

  it("devuelve undefined ante un body no-objeto", () => {
    expect(extractNotificationId(null)).toBeUndefined();
    expect(extractNotificationId("string")).toBeUndefined();
    expect(extractNotificationId(42)).toBeUndefined();
  });

  it("un intento de enviar user_id/job_id/title/body/subscriptions distintos es ignorado por completo — solo se extrae notification_id", () => {
    const malicious = {
      notification_id: "11111111-1111-1111-1111-111111111111",
      user_id: "otro-usuario",
      job_id: "otro-job",
      title: "Título falso",
      body: "Cuerpo falso",
      subscriptions: [{ endpoint: "https://evil.example/x" }],
    };
    const result = extractNotificationId(malicious);
    expect(result).toBe("11111111-1111-1111-1111-111111111111");
    // No hay ninguna función en logic.ts que lea user_id/job_id/title/body/subscriptions
    // del body — extractNotificationId() es la ÚNICA puerta de entrada del request,
    // y solo puede devolver ese único campo.
  });
});

describe("secretsMatch — test #1, #2", () => {
  it("falta el header (provided vacío) → false", () => {
    expect(secretsMatch(null, "el-secreto-real")).toBe(false);
    expect(secretsMatch(undefined, "el-secreto-real")).toBe(false);
    expect(secretsMatch("", "el-secreto-real")).toBe(false);
  });

  it("falta el secret configurado (expected vacío) → false", () => {
    expect(secretsMatch("lo-que-sea", null)).toBe(false);
    expect(secretsMatch("lo-que-sea", undefined)).toBe(false);
    expect(secretsMatch("lo-que-sea", "")).toBe(false);
  });

  it("secret incorrecto → false", () => {
    expect(secretsMatch("secreto-incorrecto", "el-secreto-real")).toBe(false);
  });

  it("longitudes distintas → false sin comparar carácter a carácter fuera de rango", () => {
    expect(secretsMatch("corto", "un-secreto-mucho-mas-largo")).toBe(false);
  });

  it("secret correcto → true", () => {
    expect(secretsMatch("el-secreto-real", "el-secreto-real")).toBe(true);
  });
});

describe("buildPushPayload — test #15", () => {
  it("usa data.jobId cuando está presente", () => {
    const payload = buildPushPayload(makeNotification());
    expect(payload).toEqual({
      title: "Trabajo próximo",
      body: 'Tu trabajo "Carga y descarga" comienza en aproximadamente 1 hora.',
      jobId: "33333333-3333-3333-3333-333333333333",
    });
    // Exactamente 3 claves — nunca user_id, sender_id, conversation_id, etc.
    expect(Object.keys(payload).sort()).toEqual(["body", "jobId", "title"]);
  });

  it("cae a job_id cuando data.jobId no es un string", () => {
    const payload = buildPushPayload(
      makeNotification({ data: { reminderType: "1h" }, job_id: "44444444-4444-4444-4444-444444444444" })
    );
    expect(payload.jobId).toBe("44444444-4444-4444-4444-444444444444");
  });

  it("jobId es null si no hay data.jobId ni job_id", () => {
    const payload = buildPushPayload(makeNotification({ data: null, job_id: null }));
    expect(payload.jobId).toBeNull();
  });

  it("usa un título/cuerpo por defecto si vienen null", () => {
    const payload = buildPushPayload(makeNotification({ title: null, body: null }));
    expect(payload.title).toBe("Chamby");
    expect(payload.body).toBe("Tienes una notificación nueva.");
  });
});

describe("shouldRemoveSubscription — test #12, #13, #14", () => {
  it("404 → eliminar (test #12)", () => {
    expect(shouldRemoveSubscription(404)).toBe(true);
  });

  it("410 → eliminar (test #13)", () => {
    expect(shouldRemoveSubscription(410)).toBe(true);
  });

  it("400 → NO eliminar (test #14)", () => {
    expect(shouldRemoveSubscription(400)).toBe(false);
  });

  it("500 → NO eliminar (test #14)", () => {
    expect(shouldRemoveSubscription(500)).toBe(false);
  });

  it("200/201 → NO eliminar", () => {
    expect(shouldRemoveSubscription(200)).toBe(false);
    expect(shouldRemoveSubscription(201)).toBe(false);
  });
});

describe("wasAlreadyDispatched — P1-B2.5 idempotencia", () => {
  it("UPDATE afectó una fila (primera invocación) → NO estaba despachada", () => {
    expect(wasAlreadyDispatched([{ id: "11111111-1111-1111-1111-111111111111" }])).toBe(false);
  });

  it("UPDATE no afectó ninguna fila (ya se había marcado antes) → SÍ estaba despachada", () => {
    expect(wasAlreadyDispatched([])).toBe(true);
  });

  it("data null (Supabase devuelve null cuando el UPDATE no matchea nada) → SÍ estaba despachada", () => {
    expect(wasAlreadyDispatched(null)).toBe(true);
  });
});
