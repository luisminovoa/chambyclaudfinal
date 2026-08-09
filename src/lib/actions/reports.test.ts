import { describe, expect, it, vi, beforeEach } from "vitest";
import { submitReport, getMyReports } from "./reports";

interface InsertedRow {
  reporter_id: string;
  target_type: string;
  reported_user_id: string | null;
  reported_job_id: string | null;
  related_job_id: string | null;
  reason: string;
  description: string;
}

interface State {
  user: { id: string } | null;
  inserted: InsertedRow[];
  insertError: { message: string } | null;
  viewQueriedTable: string | null;
  viewRows: unknown[];
}

const state: State = {
  user: null,
  inserted: [],
  insertError: null,
  viewQueriedTable: null,
  viewRows: [],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "reports") {
        return {
          insert: async (row: InsertedRow) => {
            state.inserted.push(row);
            return { error: state.insertError };
          },
        };
      }
      if (table === "reporter_reports_view") {
        state.viewQueriedTable = table;
        return {
          select: () => ({
            order: async () => ({ data: state.viewRows }),
          }),
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const REPORTER_ID = "worker-1";
const OTHER_USER_ID = "employer-1";

describe("submitReport", () => {
  beforeEach(() => {
    state.user = { id: REPORTER_ID };
    state.inserted = [];
    state.insertError = null;
  });

  it("1. usuario autenticado puede crear su propio reporte", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "harassment",
      description: "Descripción del incidente.",
    });
    expect(result.success).toBe(true);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].reporter_id).toBe(REPORTER_ID);
  });

  it("2. reporter_id siempre se deriva de la sesión — no existe forma de que el input lo sobrescriba", async () => {
    const input = {
      targetType: "user" as const,
      reportedUserId: OTHER_USER_ID,
      reason: "harassment" as const,
      description: "Intento de falsificar reporter_id.",
      // Propiedad extra que no forma parte del tipo de entrada — simula
      // un cliente que intenta colar un reporter_id ajeno en el body.
      reporterId: "otro-usuario-cualquiera",
    };
    await submitReport(input);
    expect(state.inserted[0].reporter_id).toBe(REPORTER_ID);
    expect(state.inserted[0]).not.toHaveProperty("reporterId");
  });

  it("3. no se puede reportar a uno mismo — rechazado antes de llegar a la base de datos", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: REPORTER_ID,
      reason: "other",
      description: "Auto-reporte.",
    });
    expect(result.error).toBe("No puedes reportarte a ti mismo.");
    expect(state.inserted).toHaveLength(0);
  });

  it("4. usuario no autenticado no puede crear un reporte", async () => {
    state.user = null;
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "other",
      description: "x",
    });
    expect(result.error).toBeTruthy();
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza target_type inválido", async () => {
    const result = await submitReport({
      // @ts-expect-error — valor inválido a propósito
      targetType: "worker",
      reportedUserId: OTHER_USER_ID,
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("Tipo de reporte inválido.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza reason inválido", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      // @ts-expect-error — valor inválido a propósito
      reason: "inventado",
      description: "x",
    });
    expect(result.error).toBe("Motivo inválido.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza descripción vacía", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "other",
      description: "   ",
    });
    expect(result.error).toBe("La descripción no puede estar vacía.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza target_type='user' sin reportedUserId", async () => {
    const result = await submitReport({
      targetType: "user",
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("Falta el usuario reportado.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza target_type='job' sin reportedJobId", async () => {
    const result = await submitReport({
      targetType: "job",
      reason: "spam",
      description: "x",
    });
    expect(result.error).toBe("Falta la oferta reportada.");
    expect(state.inserted).toHaveLength(0);
  });

  it("target_type='job' nunca escribe reported_user_id", async () => {
    await submitReport({
      targetType: "job",
      reportedJobId: "job-1",
      reason: "spam",
      description: "x",
    });
    expect(state.inserted[0].reported_user_id).toBeNull();
    expect(state.inserted[0].reported_job_id).toBe("job-1");
  });

  it("error de Supabase en el insert se propaga como ActionResult", async () => {
    state.insertError = { message: "db down" };
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "other",
      description: "x",
    });
    expect(result.error).toBeTruthy();
  });
});

describe("getMyReports", () => {
  beforeEach(() => {
    state.user = { id: REPORTER_ID };
    state.viewQueriedTable = null;
    state.viewRows = [{ id: "report-1", status: "pending" }];
  });

  it("6. usuario no autenticado no puede leer reportes (ni los propios) — lista vacía sin consultar la vista", async () => {
    state.user = null;
    const result = await getMyReports();
    expect(result).toEqual([]);
    expect(state.viewQueriedTable).toBeNull();
  });

  it("consulta siempre reporter_reports_view, nunca la tabla `reports` directamente", async () => {
    const result = await getMyReports();
    expect(state.viewQueriedTable).toBe("reporter_reports_view");
    expect(result).toEqual(state.viewRows);
  });
});
