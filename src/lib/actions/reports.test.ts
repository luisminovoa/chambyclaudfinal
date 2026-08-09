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

interface JobRow {
  id: string;
  employer_id: string;
  assigned_worker_id: string | null;
}

interface State {
  user: { id: string } | null;
  inserted: InsertedRow[];
  insertError: { code?: string; message: string } | null;
  profiles: Set<string>;
  jobs: Map<string, JobRow>;
  viewQueriedTable: string | null;
  viewRows: unknown[];
}

const state: State = {
  user: null,
  inserted: [],
  insertError: null,
  profiles: new Set(),
  jobs: new Map(),
  viewQueriedTable: null,
  viewRows: [],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "reports") {
        return {
          insert: (row: InsertedRow) => {
            state.inserted.push(row);
            return {
              select: () => ({
                single: async () =>
                  state.insertError
                    ? { data: null, error: state.insertError }
                    : { data: { id: `report-${state.inserted.length}` }, error: null },
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({ data: state.profiles.has(val) ? { id: val } : null }),
            }),
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({ data: state.jobs.get(val) ?? null }),
            }),
          }),
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

const REPORTER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

describe("submitReport", () => {
  beforeEach(() => {
    state.user = { id: REPORTER_ID };
    state.inserted = [];
    state.insertError = null;
    state.profiles = new Set([REPORTER_ID, OTHER_USER_ID]);
    state.jobs = new Map([[JOB_ID, { id: JOB_ID, employer_id: OTHER_USER_ID, assigned_worker_id: null }]]);
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

  it("2. usuario no autenticado es rechazado", async () => {
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

  it("3. reporter_id siempre se deriva de la sesión — no existe forma de que el input lo sobrescriba", async () => {
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

  it("4. no se puede reportar a uno mismo — rechazado antes de llegar a la base de datos", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: REPORTER_ID,
      reason: "other",
      description: "Auto-reporte.",
    });
    expect(result.error).toBe("No puedes reportarte a ti mismo.");
    expect(state.inserted).toHaveLength(0);
  });

  it("5a. usuario reportado inexistente es rechazado", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: "99999999-9999-4999-8999-999999999999",
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("El usuario reportado no existe.");
    expect(state.inserted).toHaveLength(0);
  });

  it("5b. oferta reportada inexistente es rechazada", async () => {
    const result = await submitReport({
      targetType: "job",
      reportedJobId: "99999999-9999-4999-8999-999999999999",
      reason: "spam",
      description: "x",
    });
    expect(result.error).toBe("La oferta reportada no existe.");
    expect(state.inserted).toHaveLength(0);
  });

  it("6a. target_type='user' con reportedJobId también presente es rechazado (incompatible)", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reportedJobId: JOB_ID,
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("Datos de reporte inconsistentes.");
    expect(state.inserted).toHaveLength(0);
  });

  it("6b. target_type='job' con reportedUserId también presente es rechazado (incompatible)", async () => {
    const result = await submitReport({
      targetType: "job",
      reportedJobId: JOB_ID,
      reportedUserId: OTHER_USER_ID,
      reason: "spam",
      description: "x",
    });
    expect(result.error).toBe("Datos de reporte inconsistentes.");
    expect(state.inserted).toHaveLength(0);
  });

  it("7. motivo inválido es rechazado", async () => {
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

  it("8. reporte duplicado (unique_violation de Postgres) se maneja con un mensaje amigable, sin romper la aplicación", async () => {
    state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "harassment",
      description: "Segundo intento sobre el mismo caso.",
    });
    expect(result.error).toBe(
      "Ya tienes un reporte activo sobre este usuario por este motivo. Nuestro equipo ya lo está revisando."
    );
    expect(result.success).toBeUndefined();
  });

  describe("Fase 6 — anti-duplicado para reportes de oferta (reports_no_duplicate_active_job, 0025)", () => {
    it("1. primer reporte de una oferta es permitido", async () => {
      const result = await submitReport({
        targetType: "job",
        reportedJobId: JOB_ID,
        reason: "spam",
        description: "x",
      });
      expect(result.success).toBe(true);
      expect(state.inserted).toHaveLength(1);
    });

    it("2/3. un duplicado exacto (mismo reportante, misma oferta, mismo motivo) es rechazado con mensaje amigable — distinto al de reportes de usuario", async () => {
      state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
      const result = await submitReport({
        targetType: "job",
        reportedJobId: JOB_ID,
        reason: "spam",
        description: "Segundo intento sobre la misma oferta.",
      });
      expect(result.error).toBe(
        "Ya tienes un reporte activo sobre esta oferta por este motivo. Nuestro equipo ya lo está revisando."
      );
    });

    it("no reescribe el mensaje de duplicado de reportes de USUARIO (regresión): sigue diciendo 'este usuario', no 'esta oferta'", async () => {
      state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
      const result = await submitReport({
        targetType: "user",
        reportedUserId: OTHER_USER_ID,
        reason: "harassment",
        description: "x",
      });
      expect(result.error).toBe(
        "Ya tienes un reporte activo sobre este usuario por este motivo. Nuestro equipo ya lo está revisando."
      );
    });

    it("5. la Server Action no impone ninguna restricción propia de motivo único — la legitimidad de 'mismo job, motivo distinto' depende exclusivamente del índice parcial (no hay chequeo de reason duplicado aquí)", async () => {
      // submitReport() no consulta reports existentes antes de insertar —
      // toda la deduplicación vive en el índice único parcial de 0025, no
      // en la Server Action (mismo criterio que reports_no_duplicate_active
      // de 0019 para usuarios). Este test documenta esa decisión: sin
      // insertError simulado, dos motivos distintos para la misma oferta
      // se insertan ambos sin que la Server Action los bloquee.
      await submitReport({ targetType: "job", reportedJobId: JOB_ID, reason: "spam", description: "x" });
      await submitReport({ targetType: "job", reportedJobId: JOB_ID, reason: "discrimination", description: "y" });
      expect(state.inserted).toHaveLength(2);
    });

    it("7. los reportes de usuario existentes (0019) siguen funcionando exactamente igual tras agregar el índice de oferta", async () => {
      const result = await submitReport({
        targetType: "user",
        reportedUserId: OTHER_USER_ID,
        reason: "harassment",
        description: "x",
      });
      expect(result.success).toBe(true);
      expect(state.inserted[0].reported_job_id).toBeNull();
    });
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
    const result = await submitReport({ targetType: "user", reason: "other", description: "x" });
    expect(result.error).toBe("Falta el usuario reportado.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza target_type='job' sin reportedJobId", async () => {
    const result = await submitReport({ targetType: "job", reason: "spam", description: "x" });
    expect(result.error).toBe("Falta la oferta reportada.");
    expect(state.inserted).toHaveLength(0);
  });

  it("rechaza un reportedUserId con formato inválido (protección IDOR/inyección)", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: "'; drop table reports; --",
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("Identificador de usuario inválido.");
    expect(state.inserted).toHaveLength(0);
  });

  it("target_type='job' nunca escribe reported_user_id", async () => {
    await submitReport({ targetType: "job", reportedJobId: JOB_ID, reason: "spam", description: "x" });
    expect(state.inserted[0].reported_user_id).toBeNull();
    expect(state.inserted[0].reported_job_id).toBe(JOB_ID);
  });

  it("related_job_id: se acepta cuando el trabajo involucra al reportante", async () => {
    state.jobs.set(JOB_ID, { id: JOB_ID, employer_id: REPORTER_ID, assigned_worker_id: null });
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      relatedJobId: JOB_ID,
      reason: "payment_issue",
      description: "x",
    });
    expect(result.success).toBe(true);
    expect(state.inserted[0].related_job_id).toBe(JOB_ID);
  });

  it("related_job_id: se rechaza cuando el trabajo no involucra ni al reportante ni al reportado", async () => {
    state.jobs.set(JOB_ID, { id: JOB_ID, employer_id: "un-tercero", assigned_worker_id: "otro-tercero" });
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      relatedJobId: JOB_ID,
      reason: "payment_issue",
      description: "x",
    });
    expect(result.error).toBe("El trabajo relacionado no corresponde a este reporte.");
    expect(state.inserted).toHaveLength(0);
  });

  it("related_job_id inexistente es rechazado", async () => {
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      relatedJobId: "99999999-9999-4999-8999-999999999999",
      reason: "payment_issue",
      description: "x",
    });
    expect(result.error).toBe("El trabajo relacionado no existe.");
    expect(state.inserted).toHaveLength(0);
  });

  it("error genérico de Supabase en el insert se propaga como ActionResult sin exponer detalle interno", async () => {
    state.insertError = { message: "db down" };
    const result = await submitReport({
      targetType: "user",
      reportedUserId: OTHER_USER_ID,
      reason: "other",
      description: "x",
    });
    expect(result.error).toBe("No se pudo enviar el reporte. Intenta de nuevo.");
  });
});

describe("getMyReports", () => {
  beforeEach(() => {
    state.user = { id: REPORTER_ID };
    state.viewQueriedTable = null;
    state.viewRows = [{ id: "report-1", status: "pending", description: "mi propia descripción" }];
  });

  it("9. usuario no autenticado no puede leer reportes (ni los propios) — lista vacía sin consultar la vista", async () => {
    state.user = null;
    const result = await getMyReports();
    expect(result).toEqual([]);
    expect(state.viewQueriedTable).toBeNull();
  });

  it("9. un usuario autenticado solo puede consultar sus propios reportes — vía reporter_reports_view, que ya filtra por auth.uid() en el servidor", async () => {
    const result = await getMyReports();
    expect(state.viewQueriedTable).toBe("reporter_reports_view");
    expect(result).toEqual(state.viewRows);
  });

  it("10. campos administrativos no se devuelven al reportante: getMyReports nunca consulta la tabla `reports` directamente", async () => {
    // El mock de "reports" solo define insert() — si getMyReports() alguna
    // vez consultara esa tabla en vez de la vista, esta llamada lanzaría
    // (select no existe en el mock), y el test fallaría de forma ruidosa.
    await expect(getMyReports()).resolves.not.toThrow();
    expect(state.viewQueriedTable).toBe("reporter_reports_view");
  });
});
