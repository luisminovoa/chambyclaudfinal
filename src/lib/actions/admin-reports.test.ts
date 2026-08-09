import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  listReports,
  getReportDetail,
  updateReportStatus,
  recordModerationAction,
  getReportCounts,
} from "./admin-reports";

/**
 * Mock genérico de tabla: soporta los métodos de encadenamiento que
 * admin-reports.ts realmente usa (eq/in/ilike/order/limit/single/
 * maybeSingle/then). `.or()` es un no-op deliberado — reimplementar el
 * parser de filtros de PostgREST no aporta valor de test real; los
 * casos de búsqueda por nombre se verifican por el efecto que SÍ
 * podemos observar sin eso (que se consulta `profiles.ilike` primero,
 * y que una búsqueda sin coincidencias corta antes de tocar `reports`
 * — ver el `if (ids.length === 0) return []` real en el código).
 */
function selectChain(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const chain = {
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    in(col: string, vals: unknown[]) {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return chain;
    },
    ilike(col: string, pattern: string) {
      const needle = pattern.replace(/%/g, "").toLowerCase();
      filtered = filtered.filter((r) => String(r[col] ?? "").toLowerCase().includes(needle));
      return chain;
    },
    or() {
      return chain;
    },
    gte() {
      return chain;
    },
    lte() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    single: async () => ({ data: filtered[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    then(resolve: (v: { data: unknown[]; error: null; count: number }) => void) {
      resolve({ data: filtered, error: null, count: filtered.length });
    },
  };
  return chain;
}

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  reported_user_id: string | null;
  reported_job_id: string | null;
  related_job_id: string | null;
  reason: string;
  description: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ModerationActionRow {
  id: string;
  report_id: string | null;
  admin_id: string;
  target_user_id: string | null;
  action_type: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface State {
  user: { id: string } | null;
  profiles: { id: string; full_name: string; avatar_url: string | null; city: string | null; role: string }[];
  jobs: { id: string; title: string }[];
  reports: ReportRow[];
  reportEvidence: { report_id: string }[];
  moderationActions: ModerationActionRow[];
  /** Fase 9: simula el error que devolvería Postgres si trg_report_status_transition (0026) rechazara el UPDATE. */
  updateErrorMessage: string | null;
  /** Fase 10: simula el error que devolvería Postgres si trg_moderation_action_target_coherence (0027) rechazara el INSERT. */
  moderationActionInsertErrorMessage: string | null;
}

const state: State = {
  user: null,
  profiles: [],
  jobs: [],
  reports: [],
  reportEvidence: [],
  moderationActions: [],
  updateErrorMessage: null,
  moderationActionInsertErrorMessage: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => selectChain(state.profiles as unknown as Record<string, unknown>[]) };
      }
      if (table === "jobs") {
        return { select: () => selectChain(state.jobs as unknown as Record<string, unknown>[]) };
      }
      if (table === "report_evidence") {
        return { select: () => selectChain(state.reportEvidence as unknown as Record<string, unknown>[]) };
      }
      if (table === "reports") {
        return {
          select: () => selectChain(state.reports as unknown as Record<string, unknown>[]),
          update: (payload: Partial<ReportRow>) => {
            const filters: Record<string, unknown> = {};
            const updateBuilder = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return updateBuilder;
              },
              select: () => ({
                maybeSingle: async () => {
                  if (state.updateErrorMessage) {
                    return { data: null, error: { message: state.updateErrorMessage } };
                  }
                  const row = state.reports.find((r) =>
                    Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v)
                  );
                  if (!row) return { data: null, error: null };
                  Object.assign(row, payload);
                  return { data: { id: row.id }, error: null };
                },
              }),
            };
            return updateBuilder;
          },
        };
      }
      if (table === "moderation_actions") {
        return {
          select: () => selectChain(state.moderationActions as unknown as Record<string, unknown>[]),
          insert: async (payload: Omit<ModerationActionRow, "id" | "created_at">) => {
            if (state.moderationActionInsertErrorMessage) {
              return { error: { message: state.moderationActionInsertErrorMessage } };
            }
            state.moderationActions.push({
              id: `ma-${state.moderationActions.length + 1}`,
              created_at: new Date().toISOString(),
              ...payload,
            });
            return { error: null };
          },
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const REPORTER_ID = "22222222-2222-4222-8222-222222222222";
const REPORTED_ID = "33333333-3333-4333-8333-333333333333";
const REPORT_ID = "44444444-4444-4444-8444-444444444444";

function baseReport(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: REPORT_ID,
    reporter_id: REPORTER_ID,
    target_type: "user",
    reported_user_id: REPORTED_ID,
    reported_job_id: null,
    related_job_id: null,
    reason: "harassment",
    description: "Descripción del incidente.",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    admin_notes: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.user = { id: ADMIN_ID };
  state.profiles = [
    { id: ADMIN_ID, full_name: "Admin Uno", avatar_url: null, city: null, role: "admin" },
    { id: REPORTER_ID, full_name: "Reportante", avatar_url: null, city: "Lima", role: "worker" },
    { id: REPORTED_ID, full_name: "Reportado", avatar_url: null, city: "Lima", role: "employer" },
  ];
  state.jobs = [];
  state.reports = [baseReport()];
  state.reportEvidence = [];
  state.moderationActions = [];
  state.updateErrorMessage = null;
  state.moderationActionInsertErrorMessage = null;
});

describe("listReports", () => {
  it("1. admin puede listar reportes", async () => {
    const list = await listReports();
    expect(list).toHaveLength(1);
    expect(list[0].reporter?.full_name).toBe("Reportante");
    expect(list[0].reportedUser?.full_name).toBe("Reportado");
  });

  it("2. un usuario no-admin no puede listar reportes", async () => {
    state.profiles.find((p) => p.id === ADMIN_ID)!.role = "worker";
    await expect(listReports()).rejects.toThrow("No autorizado");
  });

  it("usuario no autenticado no puede listar reportes", async () => {
    state.user = null;
    await expect(listReports()).rejects.toThrow("No autenticado");
  });

  it("indica hasEvidence=true cuando existe report_evidence para ese reporte", async () => {
    state.reportEvidence = [{ report_id: REPORT_ID }];
    const [item] = await listReports();
    expect(item.hasEvidence).toBe(true);
  });

  it("búsqueda por nombre sin coincidencias devuelve lista vacía sin consultar `reports`", async () => {
    const result = await listReports({ search: "nombre-que-no-existe" });
    expect(result).toEqual([]);
  });
});

describe("getReportDetail", () => {
  it("3. admin puede consultar el detalle de un reporte", async () => {
    const detail = await getReportDetail(REPORT_ID);
    expect(detail?.id).toBe(REPORT_ID);
    expect(detail?.reporter?.full_name).toBe("Reportante");
    expect(detail?.reportedUser?.full_name).toBe("Reportado");
    expect(detail?.moderationActions).toEqual([]);
  });

  it("4. un usuario no-admin no puede consultar el detalle", async () => {
    state.profiles.find((p) => p.id === ADMIN_ID)!.role = "employer";
    await expect(getReportDetail(REPORT_ID)).rejects.toThrow("No autorizado");
  });

  it("11. UUID inválido es rechazado sin consultar la base de datos", async () => {
    const detail = await getReportDetail("no-es-un-uuid");
    expect(detail).toBeNull();
  });

  it("12. reporte inexistente devuelve null en vez de lanzar", async () => {
    const detail = await getReportDetail("99999999-9999-4999-8999-999999999999");
    expect(detail).toBeNull();
  });

  it("incluye el historial de moderation_actions con el nombre del admin que las registró", async () => {
    state.moderationActions = [
      {
        id: "ma-1",
        report_id: REPORT_ID,
        admin_id: ADMIN_ID,
        target_user_id: REPORTED_ID,
        action_type: "note_added",
        reason: "Nota de prueba",
        metadata: {},
        created_at: "2026-08-02T00:00:00.000Z",
      },
    ];
    const detail = await getReportDetail(REPORT_ID);
    expect(detail?.moderationActions).toHaveLength(1);
    expect(detail?.moderationActions[0].admin?.full_name).toBe("Admin Uno");
  });
});

describe("updateReportStatus", () => {
  it("5. admin puede cambiar a un estado válido (pending → under_review)", async () => {
    const result = await updateReportStatus(REPORT_ID, "under_review");
    expect(result.success).toBe(true);
    expect(state.reports[0].status).toBe("under_review");
  });

  it("6. una transición inválida es rechazada (pending → resolved, debe pasar por under_review)", async () => {
    const result = await updateReportStatus(REPORT_ID, "resolved");
    expect(result.error).toMatch(/No se puede pasar/);
    expect(state.reports[0].status).toBe("pending");
  });

  it("6b. un estado terminal no puede reabrirse (resolved → under_review)", async () => {
    state.reports = [baseReport({ status: "resolved" })];
    const result = await updateReportStatus(REPORT_ID, "under_review");
    expect(result.error).toMatch(/No se puede pasar/);
  });

  it("7. admin puede agregar una nota administrativa junto con el cambio de estado", async () => {
    const result = await updateReportStatus(REPORT_ID, "under_review", "Reviso este caso.");
    expect(result.success).toBe(true);
    expect(state.reports[0].admin_notes).toBe("Reviso este caso.");
  });

  it("un usuario no-admin no puede cambiar el estado de un reporte", async () => {
    state.profiles.find((p) => p.id === ADMIN_ID)!.role = "worker";
    await expect(updateReportStatus(REPORT_ID, "under_review")).rejects.toThrow("No autorizado");
    expect(state.reports[0].status).toBe("pending");
  });

  it("registra automáticamente una fila status_changed en moderation_actions", async () => {
    await updateReportStatus(REPORT_ID, "under_review");
    expect(state.moderationActions).toHaveLength(1);
    expect(state.moderationActions[0]).toMatchObject({
      report_id: REPORT_ID,
      admin_id: ADMIN_ID,
      target_user_id: REPORTED_ID,
      action_type: "status_changed",
      metadata: { from: "pending", to: "under_review" },
    });
  });

  it("11. UUID de reporte inválido es rechazado", async () => {
    const result = await updateReportStatus("../../etc/passwd", "under_review");
    expect(result.error).toBe("Reporte inválido.");
  });

  it("estado inválido (fuera del enum) es rechazado", async () => {
    // @ts-expect-error — valor inválido a propósito
    const result = await updateReportStatus(REPORT_ID, "hackeado");
    expect(result.error).toBe("Estado inválido.");
  });

  it("12. reporte inexistente es manejado con un error claro, no una excepción", async () => {
    const result = await updateReportStatus("99999999-9999-4999-8999-999999999999", "under_review");
    expect(result.error).toBe("Reporte no encontrado.");
  });

  it("Fase 9 — N-STATE-1: si trg_report_status_transition (0026) rechaza el UPDATE en la base de datos (defensa en profundidad), el error se traduce a un mensaje amigable sin filtrar detalles internos de Postgres", async () => {
    // Simula el error real que 0026 lanzaría — incluso para una llamada
    // que REPORT_STATUS_TRANSITIONS ya considera válida (pending →
    // under_review), para aislar específicamente el mapeo de error de
    // la validación de REPORT_STATUS_TRANSITIONS que ya se prueba arriba.
    state.updateErrorMessage =
      "report_status_transition_invalid: pending -> under_review no es una transición permitida";
    const result = await updateReportStatus(REPORT_ID, "under_review");
    expect(result.error).toBe("El estado del reporte ya no permite esa transición.");
    expect(result.error).not.toMatch(/P0001|trigger|Postgres|report_status_transition_invalid/i);
    expect(state.reports[0].status).toBe("pending");
  });

  it("Fase 9 — un error de base de datos NO relacionado con el trigger de transición sigue devolviendo el mensaje genérico existente", async () => {
    state.updateErrorMessage = "connection reset by peer";
    const result = await updateReportStatus(REPORT_ID, "under_review");
    expect(result.error).toBe("No se pudo actualizar el reporte.");
  });
});

describe("recordModerationAction", () => {
  it("8. admin puede registrar una acción de moderación", async () => {
    const result = await recordModerationAction(REPORT_ID, "warning_issued", "Primera advertencia");
    expect(result.success).toBe(true);
    expect(state.moderationActions).toHaveLength(1);
    expect(state.moderationActions[0]).toMatchObject({
      report_id: REPORT_ID,
      target_user_id: REPORTED_ID,
      action_type: "warning_issued",
      reason: "Primera advertencia",
    });
  });

  it("9. un usuario no-admin no puede registrar una acción de moderación", async () => {
    state.profiles.find((p) => p.id === ADMIN_ID)!.role = "worker";
    await expect(recordModerationAction(REPORT_ID, "note_added")).rejects.toThrow("No autorizado");
    expect(state.moderationActions).toHaveLength(0);
  });

  it("10. admin_id siempre proviene de la sesión (assertAdmin), nunca de un parámetro", async () => {
    // recordModerationAction no acepta ningún parámetro de admin_id —
    // la única forma de que difiera de auth.uid() sería un bug interno.
    await recordModerationAction(REPORT_ID, "note_added", "x");
    expect(state.moderationActions[0].admin_id).toBe(ADMIN_ID);
  });

  it("rechaza un action_type fuera de los tipos registrables en esta fase (p. ej. account_deactivated)", async () => {
    // account_deactivated es un valor legítimo de ModerationActionType (types.ts)
    // pero no está en RECORDABLE_ACTION_TYPES — la validación es de negocio, no de tipo.
    const result = await recordModerationAction(REPORT_ID, "account_deactivated");
    expect(result.error).toBe("Tipo de acción inválido.");
    expect(state.moderationActions).toHaveLength(0);
  });

  it("11. UUID de reporte inválido es rechazado", async () => {
    const result = await recordModerationAction("no-es-uuid", "note_added");
    expect(result.error).toBe("Reporte inválido.");
  });

  it("12. reporte inexistente es manejado con un error claro", async () => {
    const result = await recordModerationAction("99999999-9999-4999-8999-999999999999", "note_added");
    expect(result.error).toBe("Reporte no encontrado.");
  });

  it("target_user_id siempre se deriva del reporte en el servidor, no de un parámetro del cliente", async () => {
    // La firma de recordModerationAction no acepta targetUserId en absoluto.
    await recordModerationAction(REPORT_ID, "temporary_suspension", "x");
    expect(state.moderationActions[0].target_user_id).toBe(REPORTED_ID);
  });

  it("Fase 10 — si trg_moderation_action_target_coherence (0027) rechaza el INSERT en la base de datos (defensa en profundidad), el error se traduce a un mensaje amigable sin filtrar detalles internos de Postgres", async () => {
    // target_user_id ya se deriva del reporte real arriba (línea previa),
    // así que esto simula específicamente el catch de la Server Action,
    // no un escenario alcanzable por la validación normal de la app.
    state.moderationActionInsertErrorMessage =
      "moderation_action_target_mismatch: target_user_id no coincide con reports.reported_user_id del report_id referenciado";
    const result = await recordModerationAction(REPORT_ID, "warning_issued");
    expect(result.error).toBe("No se pudo registrar la acción: el usuario objetivo no corresponde a este reporte.");
    expect(result.error).not.toMatch(/P0001|trigger|Postgres|moderation_action_target_mismatch/i);
    expect(state.moderationActions).toHaveLength(0);
  });

  it("Fase 10 — un error de base de datos NO relacionado con la coherencia de target_user_id sigue devolviendo el mensaje genérico existente", async () => {
    state.moderationActionInsertErrorMessage = "connection reset by peer";
    const result = await recordModerationAction(REPORT_ID, "warning_issued");
    expect(result.error).toBe("No se pudo registrar la acción de moderación.");
  });
});

describe("getReportCounts", () => {
  it("cuenta reportes por estado", async () => {
    state.reports = [
      baseReport({ id: "a1111111-1111-4111-8111-111111111111", status: "pending" }),
      baseReport({ id: "a2222222-2222-4222-8222-222222222222", status: "under_review" }),
      baseReport({ id: "a3333333-3333-4333-8333-333333333333", status: "resolved" }),
      baseReport({ id: "a4444444-4444-4444-8444-444444444444", status: "dismissed" }),
      baseReport({ id: "a5555555-5555-4555-8555-555555555555", status: "pending" }),
    ];
    const counts = await getReportCounts();
    expect(counts).toEqual({ pending: 2, under_review: 1, resolved: 1, dismissed: 1 });
  });

  it("un usuario no-admin no puede consultar los contadores", async () => {
    state.profiles.find((p) => p.id === ADMIN_ID)!.role = "worker";
    await expect(getReportCounts()).rejects.toThrow("No autorizado");
  });
});
