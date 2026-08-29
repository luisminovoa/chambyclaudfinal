import { describe, expect, it, vi, beforeEach } from "vitest";
import { submitRating } from "./ratings";

/**
 * Fase 4 / C4-G14 — la auditoría C4-G13 confirmó que submitRating() no
 * tenía ningún test, pese a ser la única puerta de entrada para crear una
 * calificación. Esta suite no modifica producción: documenta y verifica
 * el comportamiento ya existente (validación de score, autorización de
 * contraparte, prevención de doble calificación vía el constraint
 * `unique(job_id, rater_id, rated_id)` mapeado al código Postgres 23505).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

interface JobFixture {
  status: string;
  employer_id: string;
  assigned_worker_id: string | null;
}

interface InsertPayload {
  job_id: string;
  rater_id: string;
  rated_id: string;
  score: number;
  comment: string | null;
}

const state: {
  user: { id: string } | null;
  job: JobFixture | null;
  insertError: { code?: string; message?: string } | null;
  insertCalls: InsertPayload[];
} = {
  user: { id: "employer-1" },
  job: null,
  insertError: null,
  insertCalls: [],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: state.job }),
            }),
          }),
        };
      }
      if (table === "ratings") {
        return {
          insert: async (payload: InsertPayload) => {
            state.insertCalls.push(payload);
            return { error: state.insertError };
          },
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const EMPLOYER_ID = "employer-1";
const WORKER_ID = "worker-1";
const OTHER_USER_ID = "other-user-1";

function completedJob(overrides: Partial<JobFixture> = {}): JobFixture {
  return {
    status: "completado",
    employer_id: EMPLOYER_ID,
    assigned_worker_id: WORKER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  state.user = { id: EMPLOYER_ID };
  state.job = completedJob();
  state.insertError = null;
  state.insertCalls = [];
});

describe("submitRating() — validación de score (Fase 4 / C4-G14)", () => {
  it("A) los 5 valores enteros válidos (1-5) se aceptan", async () => {
    for (const score of [1, 2, 3, 4, 5]) {
      state.insertCalls = [];
      const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score });
      expect(result).toEqual({ success: true });
      expect(state.insertCalls).toHaveLength(1);
    }
  });

  it("B) score 0 se rechaza antes de tocar la base de datos", async () => {
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 0 });
    expect(result).toEqual({ error: "La calificación debe ser un número entero entre 1 y 5." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("C) score 6 se rechaza antes de tocar la base de datos", async () => {
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 6 });
    expect(result).toEqual({ error: "La calificación debe ser un número entero entre 1 y 5." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("D) un score decimal (3.5) se rechaza (no es entero)", async () => {
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 3.5 });
    expect(result).toEqual({ error: "La calificación debe ser un número entero entre 1 y 5." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("score negativo también se rechaza", async () => {
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: -1 });
    expect(result?.error).toBeTruthy();
    expect(state.insertCalls).toHaveLength(0);
  });
});

describe("submitRating() — autorización de contraparte (Fase 4 / C4-G14)", () => {
  it("E) un usuario que no es empleador ni trabajador asignado de ese job es rechazado", async () => {
    state.user = { id: OTHER_USER_ID };
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "Solo puedes calificar a la contraparte de este trabajo." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("F) el empleador solo puede calificar al assigned_worker_id real — un ratedId distinto se rechaza", async () => {
    state.user = { id: EMPLOYER_ID };
    const result = await submitRating({ jobId: "job-1", ratedId: "otro-worker-inventado", score: 5 });
    expect(result).toEqual({ error: "Solo puedes calificar a la contraparte de este trabajo." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("G) el trabajador asignado solo puede calificar al employer_id real — un ratedId distinto se rechaza", async () => {
    state.user = { id: WORKER_ID };
    const result = await submitRating({ jobId: "job-1", ratedId: "otro-employer-inventado", score: 5 });
    expect(result).toEqual({ error: "Solo puedes calificar a la contraparte de este trabajo." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("el trabajador asignado SÍ puede calificar correctamente al employer_id real (dirección worker→employer, misma arquitectura bidireccional)", async () => {
    state.user = { id: WORKER_ID };
    const result = await submitRating({ jobId: "job-1", ratedId: EMPLOYER_ID, score: 4 });
    expect(result).toEqual({ success: true });
    expect(state.insertCalls[0]).toMatchObject({ rater_id: WORKER_ID, rated_id: EMPLOYER_ID });
  });

  it("sin sesión, se rechaza antes de consultar el job", async () => {
    state.user = null;
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "Debes iniciar sesión para calificar." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("job inexistente se rechaza", async () => {
    state.job = null;
    const result = await submitRating({ jobId: "job-inexistente", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "Trabajo no encontrado." });
  });
});

describe("submitRating() — estado del job (Fase 4 / C4-G14)", () => {
  it("H) un job en 'en_progreso' (no completado) se rechaza", async () => {
    state.job = completedJob({ status: "en_progreso" });
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "Solo puedes calificar trabajos completados." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("un job 'abierto' también se rechaza", async () => {
    state.job = completedJob({ status: "abierto" });
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result?.error).toBeTruthy();
  });

  it("un job 'cancelado' también se rechaza", async () => {
    state.job = completedJob({ status: "cancelado" });
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result?.error).toBeTruthy();
  });
});

describe("submitRating() — doble calificación (Fase 4 / C4-G14)", () => {
  it("I) el constraint unique(job_id, rater_id, rated_id) (código Postgres 23505) produce el mensaje amigable existente, sin modificar esa defensa", async () => {
    state.insertError = { code: "23505", message: "duplicate key value" };
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "Ya calificaste a esta persona por este trabajo." });
  });

  it("un error de base de datos distinto de 23505 devuelve el mensaje genérico existente", async () => {
    state.insertError = { code: "23000", message: "otro error" };
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ error: "No se pudo registrar la calificación." });
  });
});

describe("submitRating() — comentario (Fase 4 / C4-G14)", () => {
  it("J) el comentario es opcional — se acepta sin él", async () => {
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5 });
    expect(result).toEqual({ success: true });
    expect(state.insertCalls[0].comment).toBeNull();
  });

  it("K) un comentario de más de 1000 caracteres se rechaza antes de tocar la base de datos", async () => {
    const result = await submitRating({
      jobId: "job-1",
      ratedId: WORKER_ID,
      score: 5,
      comment: "a".repeat(1001),
    });
    expect(result).toEqual({ error: "El comentario no puede superar los 1000 caracteres." });
    expect(state.insertCalls).toHaveLength(0);
  });

  it("un comentario de exactamente 1000 caracteres se acepta (límite inclusive)", async () => {
    const comment = "a".repeat(1000);
    const result = await submitRating({ jobId: "job-1", ratedId: WORKER_ID, score: 5, comment });
    expect(result).toEqual({ success: true });
    expect(state.insertCalls[0].comment).toBe(comment);
  });
});

describe("submitRating() — camino válido completo (Fase 4 / C4-G14)", () => {
  it("L) el rating se crea con exactamente job_id/rater_id/rated_id/score/comment correctos", async () => {
    const result = await submitRating({
      jobId: "job-42",
      ratedId: WORKER_ID,
      score: 4,
      comment: "Excelente trabajo",
    });
    expect(result).toEqual({ success: true });
    expect(state.insertCalls[0]).toEqual({
      job_id: "job-42",
      rater_id: EMPLOYER_ID,
      rated_id: WORKER_ID,
      score: 4,
      comment: "Excelente trabajo",
    });
  });
});
