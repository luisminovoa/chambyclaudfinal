import { describe, expect, it, vi, beforeEach } from "vitest";
import { listReports, getReportDetail, updateReportStatus } from "./admin-reports";

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  status: string;
}

interface ModerationActionInsert {
  report_id: string;
  admin_id: string;
  target_user_id: string | null;
  action_type: string;
  metadata: Record<string, unknown>;
}

interface State {
  user: { id: string } | null;
  profileRole: string | null;
  reports: ReportRow[];
  moderationActions: ModerationActionInsert[];
}

const state: State = { user: null, profileRole: null, reports: [], moderationActions: [] };

function matches(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: state.profileRole ? { role: state.profileRole } : null }),
            }),
          }),
        };
      }
      if (table === "reports") {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return builder;
              },
              order: () => builder,
              maybeSingle: async () => {
                const row = state.reports.find((r) => matches(r as unknown as Record<string, unknown>, filters));
                return { data: row ?? null };
              },
              then: (resolve: (v: { data: unknown }) => void) => {
                const rows = state.reports.filter((r) => matches(r as unknown as Record<string, unknown>, filters));
                resolve({ data: rows });
              },
            };
            return builder;
          },
          update: (payload: Partial<ReportRow>) => {
            const filters: Record<string, unknown> = {};
            const updateBuilder = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return updateBuilder;
              },
              select: () => ({
                maybeSingle: async () => {
                  const row = state.reports.find((r) => matches(r as unknown as Record<string, unknown>, filters));
                  if (!row) return { data: null, error: null };
                  Object.assign(row, payload);
                  return { data: { reported_user_id: row.reported_user_id }, error: null };
                },
              }),
            };
            return updateBuilder;
          },
        };
      }
      if (table === "moderation_actions") {
        return {
          insert: async (payload: ModerationActionInsert) => {
            state.moderationActions.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
  createAdminClient: () => {
    throw new Error("createAdminClient no debe usarse en estas Server Actions");
  },
}));

const ADMIN_ID = "admin-1";
const REPORT_ID = "11111111-1111-4111-8111-111111111111";

describe("listReports / getReportDetail — solo admin puede leer reportes ajenos", () => {
  beforeEach(() => {
    state.user = { id: ADMIN_ID };
    state.profileRole = "admin";
    state.reports = [
      { id: REPORT_ID, reporter_id: "worker-1", reported_user_id: "employer-1", status: "pending" },
    ];
    state.moderationActions = [];
  });

  it("6/7. un usuario no-admin no puede listar ni leer detalle de reportes ajenos: assertAdmin lanza", async () => {
    state.profileRole = "worker";
    await expect(listReports()).rejects.toThrow("No autorizado");
    await expect(getReportDetail(REPORT_ID)).rejects.toThrow("No autorizado");
  });

  it("usuario no autenticado: rechazado antes de cualquier consulta", async () => {
    state.user = null;
    await expect(listReports()).rejects.toThrow("No autenticado");
  });

  it("7. admin puede leer reportes", async () => {
    const list = await listReports("all");
    expect(list).toHaveLength(1);
    const detail = await getReportDetail(REPORT_ID);
    expect(detail?.id).toBe(REPORT_ID);
  });

  it("getReportDetail valida formato de UUID antes de consultar (protección IDOR/inyección de IDs)", async () => {
    const detail = await getReportDetail("no-es-un-uuid");
    expect(detail).toBeNull();
  });

  it("listReports filtra por estado por defecto ('pending')", async () => {
    state.reports.push({ id: "22222222-2222-4222-8222-222222222222", reporter_id: "worker-2", reported_user_id: null, status: "resolved" });
    const pending = await listReports();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
  });
});

describe("updateReportStatus — 8. admin puede realizar acciones administrativas permitidas", () => {
  beforeEach(() => {
    state.user = { id: ADMIN_ID };
    state.profileRole = "admin";
    state.reports = [
      { id: REPORT_ID, reporter_id: "worker-1", reported_user_id: "employer-1", status: "pending" },
    ];
    state.moderationActions = [];
  });

  it("un usuario no-admin no puede cambiar el estado de un reporte", async () => {
    state.profileRole = "worker";
    await expect(updateReportStatus(REPORT_ID, "resolved")).rejects.toThrow("No autorizado");
    expect(state.moderationActions).toHaveLength(0);
  });

  it("admin puede cambiar el estado y queda registrado en moderation_actions", async () => {
    const result = await updateReportStatus(REPORT_ID, "under_review");
    expect(result.success).toBe(true);
    expect(state.reports[0].status).toBe("under_review");
    expect(state.moderationActions).toHaveLength(1);
    expect(state.moderationActions[0]).toMatchObject({
      report_id: REPORT_ID,
      admin_id: ADMIN_ID,
      target_user_id: "employer-1",
      action_type: "status_changed",
    });
  });

  it("rechaza un estado inválido sin tocar la base de datos", async () => {
    // @ts-expect-error — valor inválido a propósito
    const result = await updateReportStatus(REPORT_ID, "hackeado");
    expect(result.error).toBe("Estado inválido.");
    expect(state.reports[0].status).toBe("pending");
    expect(state.moderationActions).toHaveLength(0);
  });

  it("rechaza un id con formato inválido (protección IDOR)", async () => {
    const result = await updateReportStatus("../etc/passwd", "resolved");
    expect(result.error).toBe("Reporte inválido.");
    expect(state.moderationActions).toHaveLength(0);
  });

  it("reporte inexistente: error sin registrar acción de moderación", async () => {
    const result = await updateReportStatus("99999999-9999-4999-8999-999999999999", "resolved");
    expect(result.error).toBe("Reporte no encontrado.");
    expect(state.moderationActions).toHaveLength(0);
  });
});
