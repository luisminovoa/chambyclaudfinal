import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  updateApplicationStatus,
  completeJob,
  cancelJob,
  updateJobStatus,
  reportJobFinished,
  deleteJob,
} from "./jobs";

/**
 * Cobertura de `updateApplicationStatus()` — la Server Action que
 * dispara toda la cascada de contratación. Hasta este PR, `jobs.ts` no
 * tenía ningún test: se escriben ANTES de reutilizarla desde la vista
 * agregada de postulantes (PR 2), para que cualquier regresión futura
 * en la autorización o en la transición de estados sea visible.
 *
 * Deliberadamente NO se prueba el efecto del trigger
 * `handle_application_accepted()` (asignar trabajador, pasar el job a
 * en_progreso, auto-rechazar las demás pendientes, abrir el chat): eso
 * vive en Postgres, no en TypeScript, y ya está cubierto por las
 * pruebas SQL del repositorio. Lo que sí se fija aquí es que la capa TS
 * no duplica ni interfiere con esa cascada.
 */

interface ApplicationRow {
  id: string;
  status: string;
  worker_id: string;
  job_id: string;
}

interface JobRow {
  id: string;
  employer_id: string;
  /** Solo para el test L: la capa TS nunca debe leer esta columna. */
  positions_needed: number;
  /** Usados por completeJob()/cancelJob()/updateJobStatus() — opcionales
   * porque los tests de updateApplicationStatus no los necesitan. */
  status?: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  assigned_worker_id?: string | null;
  worker_reported_finished_at?: string | null;
  employer_confirmed_at?: string | null;
}

interface JobHistoryRow {
  job_id: string;
  actor_id: string;
  prev_status: string | null;
  new_status: string;
  notes: string | null;
}

interface State {
  user: { id: string } | null;
  applications: ApplicationRow[];
  jobs: JobRow[];
  updateError: string | null;
  /** Registro de cada UPDATE emitido, para verificar que no hay efectos extra. */
  updates: { id: string; payload: Record<string, unknown> }[];
  /** Columnas realmente pedidas a la tabla `jobs`. */
  jobColumnsRequested: string[];
  /** Filas insertadas en job_state_history por completeJob()/cancelJob(). */
  history: JobHistoryRow[];
  /** Fuerza un error en el UPDATE de `jobs` (completeJob/cancelJob/updateJobStatus). */
  jobUpdateError: string | null;
  /** ids realmente borrados de `jobs` por deleteJob(). */
  jobDeletes: string[];
  /** Fuerza un error en el DELETE de `jobs` (deleteJob). */
  jobDeleteError: string | null;
}

const state: State = {
  user: null,
  applications: [],
  jobs: [],
  updateError: null,
  updates: [],
  jobColumnsRequested: [],
  history: [],
  jobUpdateError: null,
  jobDeletes: [],
  jobDeleteError: null,
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "job_applications") {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return chain;
              },
              single: async () => ({
                data: state.applications.find((a) => a.id === filters.id) ?? null,
                error: null,
              }),
            };
            return chain;
          },
          update: (payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              select: () => ({
                single: async () => {
                  if (state.updateError) {
                    return { data: null, error: { message: state.updateError } };
                  }
                  const row = state.applications.find((a) => a.id === filters.id);
                  if (!row) return { data: null, error: { message: "not found" } };
                  state.updates.push({ id: row.id, payload });
                  Object.assign(row, payload);
                  return { data: { job_id: row.job_id }, error: null };
                },
              }),
            };
            return builder;
          },
        };
      }
      if (table === "jobs") {
        return {
          select: (cols: string) => {
            state.jobColumnsRequested.push(cols);
            const filters: Record<string, unknown> = {};
            const chain = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return chain;
              },
              single: async () => ({
                data: state.jobs.find((j) => j.id === filters.id) ?? null,
                error: null,
              }),
            };
            return chain;
          },
          // cancelJob()/updateJobStatus() hacen `.update({...}).eq("id",
          // jobId)` y awaitean directamente el resultado de `.eq()` (sin
          // `.select()` encadenado) — el builder de abajo es "thenable"
          // para soportar ese uso. reportJobFinished()/completeJob()
          // (Fase 8) encadenan además `.eq()/.is()/.not()` adicionales
          // (condición de concurrencia) y `.select("id").maybeSingle()`
          // para saber si el UPDATE afectó 0 o 1 filas.
          update: (payload: Record<string, unknown>) => {
            type Filter = { col: string; op: "eq" | "is" | "not-is"; val: unknown };
            const filters: Filter[] = [];
            const matches = (row: JobRow) => {
              const r = row as unknown as Record<string, unknown>;
              return filters.every((f) => {
                if (f.op === "eq") return r[f.col] === f.val;
                if (f.op === "is") return (r[f.col] ?? null) === f.val;
                return (r[f.col] ?? null) !== f.val; // not-is
              });
            };
            const applyUpdate = () => {
              if (state.jobUpdateError) return { row: null, error: { message: state.jobUpdateError } };
              const row = state.jobs.find(matches);
              if (!row) return { row: null, error: null };
              state.updates.push({ id: row.id, payload });
              Object.assign(row, payload);
              return { row, error: null };
            };
            const builder = {
              eq(col: string, val: unknown) {
                filters.push({ col, op: "eq", val });
                return builder;
              },
              is(col: string, val: unknown) {
                filters.push({ col, op: "is", val });
                return builder;
              },
              not(col: string, _op: string, val: unknown) {
                filters.push({ col, op: "not-is", val });
                return builder;
              },
              select: () => ({
                maybeSingle: async () => {
                  const { row, error } = applyUpdate();
                  return { data: row ? { id: row.id } : null, error };
                },
                single: async () => {
                  const { row, error } = applyUpdate();
                  if (!row) return { data: null, error: error ?? { message: "not found" } };
                  return { data: { id: row.id }, error: null };
                },
              }),
              // Soporta `await supabase.from("jobs").update(...).eq(...)`
              // directamente, sin `.select()` — patrón de cancelJob()/updateJobStatus().
              then(resolve: (v: { error: unknown }) => void) {
                const { error } = applyUpdate();
                resolve({ error });
              },
            };
            return builder;
          },
          // deleteJob(): `await supabase.from("jobs").delete().eq("id", jobId)`.
          delete: () => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(resolve: (v: { error: unknown }) => void) {
                if (state.jobDeleteError) {
                  resolve({ error: { message: state.jobDeleteError } });
                  return;
                }
                const row = state.jobs.find((j) => j.id === filters.id);
                if (row) {
                  state.jobDeletes.push(row.id);
                  state.jobs = state.jobs.filter((j) => j.id !== row.id);
                }
                resolve({ error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "job_state_history") {
        return {
          insert: async (payload: JobHistoryRow) => {
            state.history.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const EMPLOYER_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYER_B = "22222222-2222-4222-8222-222222222222";
const WORKER = "33333333-3333-4333-8333-333333333333";
const WORKER_B = "55555555-5555-4555-8555-555555555555";
const JOB_A = "aaaaaaaa-1111-4111-8111-111111111111";
const APP_A = "bbbbbbbb-1111-4111-8111-111111111111";

beforeEach(() => {
  state.user = { id: EMPLOYER_A };
  state.jobs = [{ id: JOB_A, employer_id: EMPLOYER_A, positions_needed: 3 }];
  state.applications = [
    { id: APP_A, status: "pendiente", worker_id: WORKER, job_id: JOB_A },
  ];
  state.updateError = null;
  state.updates = [];
  state.jobColumnsRequested = [];
  state.history = [];
  state.jobUpdateError = null;
  state.jobDeletes = [];
  state.jobDeleteError = null;
});

describe("updateApplicationStatus — autorización", () => {
  it("H. el empleador dueño puede ACEPTAR una postulación pendiente de su publicación", async () => {
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBeUndefined();
    expect(state.applications[0].status).toBe("aceptado");
  });

  it("I. el empleador dueño puede RECHAZAR una postulación pendiente de su publicación", async () => {
    const result = await updateApplicationStatus(APP_A, "rechazado");
    expect(result.error).toBeUndefined();
    expect(state.applications[0].status).toBe("rechazado");
  });

  it("J. un empleador NO puede aceptar una postulación de la publicación de otro empleador", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBe("Esa transición de estado no está permitida.");
    expect(state.applications[0].status).toBe("pendiente");
    expect(state.updates).toHaveLength(0);
  });

  it("J2. un empleador NO puede rechazar una postulación ajena", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await updateApplicationStatus(APP_A, "rechazado");
    expect(result.error).toBe("Esa transición de estado no está permitida.");
    expect(state.updates).toHaveLength(0);
  });

  it("el trabajador no puede auto-aceptarse", async () => {
    state.user = { id: WORKER };
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBe("Esa transición de estado no está permitida.");
    expect(state.updates).toHaveLength(0);
  });

  it("el trabajador sí puede retirar su propia postulación", async () => {
    state.user = { id: WORKER };
    const result = await updateApplicationStatus(APP_A, "retirado");
    expect(result.error).toBeUndefined();
    expect(state.applications[0].status).toBe("retirado");
  });

  it("sin sesión no se puede cambiar ningún estado", async () => {
    state.user = null;
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBe("Debes iniciar sesión.");
    expect(state.updates).toHaveLength(0);
  });

  it("un estado fuera del enum es rechazado antes de tocar la base de datos", async () => {
    const result = await updateApplicationStatus(APP_A, "contratado");
    expect(result.error).toBe("Estado inválido.");
    expect(state.updates).toHaveLength(0);
  });

  it("una postulación que ya no está pendiente no admite nuevas transiciones", async () => {
    state.applications[0].status = "aceptado";
    const result = await updateApplicationStatus(APP_A, "rechazado");
    expect(result.error).toBe("Esa transición de estado no está permitida.");
  });
});

describe("updateApplicationStatus — la cascada sigue siendo de la base de datos", () => {
  it("K. aceptar emite UN SOLO update, sobre la propia postulación: el auto-rechazo de las demás lo hace el trigger, no TypeScript", async () => {
    state.applications.push(
      { id: "cccccccc-1111-4111-8111-111111111111", status: "pendiente", worker_id: "w2", job_id: JOB_A },
      { id: "dddddddd-1111-4111-8111-111111111111", status: "pendiente", worker_id: "w3", job_id: JOB_A }
    );

    await updateApplicationStatus(APP_A, "aceptado");

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ id: APP_A, payload: { status: "aceptado" } });
    // Las otras dos siguen 'pendiente' en este mock justamente porque
    // quien las rechaza es handle_application_accepted() en Postgres.
    expect(state.applications[1].status).toBe("pendiente");
    expect(state.applications[2].status).toBe("pendiente");
  });

  it("L. positions_needed no participa en la decisión: la capa TS ni siquiera lo consulta (deuda técnica registrada, sin cambios en este PR)", async () => {
    await updateApplicationStatus(APP_A, "aceptado");
    // La única consulta a `jobs` pide exclusivamente employer_id.
    expect(state.jobColumnsRequested).toEqual(["employer_id"]);
    expect(state.jobColumnsRequested.join(",")).not.toContain("positions_needed");
  });

  it("L2. una publicación con varias vacantes se acepta igual que una de una sola — comportamiento actual documentado, no corregido aquí", async () => {
    state.jobs[0].positions_needed = 5;
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBeUndefined();
    expect(state.updates).toHaveLength(1);
  });

  it("un error de base de datos (p. ej. el guard del trigger) se propaga sin enmascararse", async () => {
    state.updateError = "Este trabajo ya no acepta postulantes";
    const result = await updateApplicationStatus(APP_A, "aceptado");
    expect(result.error).toBe("Este trabajo ya no acepta postulantes");
  });
});

/**
 * Fase 8 (C4-G21) — PREREQUISITO BLOQUEANTE: `completeJob()`, `cancelJob()`
 * y `updateJobStatus()` no tenían ningún test directo antes de esta fase
 * (confirmado en la auditoría C4-G19/C4-G21 — solo se ejercitaban
 * indirectamente, mockeadas, desde EmployerJobRow.test.tsx/JobActions.test.tsx).
 * Estos tests fijan el comportamiento ACTUAL (100% unilateral del
 * empleador) ANTES de evolucionar `completeJob()` para exigir el reporte
 * del trabajador — sirven de base de regresión: deben seguir pasando
 * exactamente igual después del cambio, salvo los que se marcan
 * explícitamente como reemplazados en jobs-completion.test.ts.
 */
/**
 * Fase 8 (C4-G21): completeJob() evolucionó — ya no es unilateral. Estos
 * tests reemplazan el snapshot "prerequisito" que capturaba el
 * comportamiento anterior (validado en verde contra el código previo a
 * este cambio, antes de escribir la migración/implementación). El
 * worker_reported_finished_at ya presente en el fixture es justamente lo
 * que cambia respecto al comportamiento viejo: con eso puesto, el resto
 * de la autorización (ownership/status/sesión/errores) es idéntica a
 * antes — solo agrega la precondición nueva, no reescribe el resto.
 */
describe("completeJob() — autorización base (con reporte del trabajador ya presente)", () => {
  beforeEach(() => {
    state.jobs = [{
      id: JOB_A,
      employer_id: EMPLOYER_A,
      positions_needed: 1,
      status: "en_progreso",
      assigned_worker_id: WORKER,
      worker_reported_finished_at: "2026-01-01T00:00:00Z",
      employer_confirmed_at: null,
      completed_at: null,
      cancelled_at: null,
    }];
  });

  it("el empleador dueño puede completar un trabajo en_progreso ya reportado por el worker", async () => {
    const result = await completeJob(JOB_A);
    expect(result).toEqual({ success: true });
    expect(state.jobs[0].status).toBe("completado");
  });

  it("setea completed_at y employer_confirmed_at con timestamps no nulos, en el mismo UPDATE", async () => {
    await completeJob(JOB_A);
    expect(state.jobs[0].completed_at).toEqual(expect.any(String));
    expect(state.jobs[0].employer_confirmed_at).toEqual(expect.any(String));
    // Un solo UPDATE — no dos llamadas separadas.
    expect(state.updates).toHaveLength(1);
  });

  it("inserta exactamente una fila en job_state_history con prev/new status correctos", async () => {
    await completeJob(JOB_A);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      job_id: JOB_A,
      actor_id: EMPLOYER_A,
      prev_status: "en_progreso",
      new_status: "completado",
    });
  });

  it("un empleador que NO es el dueño no puede completar el trabajo", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("Sin permiso.");
    expect(state.jobs[0].status).toBe("en_progreso");
    expect(state.history).toHaveLength(0);
  });

  it("no se puede completar un trabajo que no está en_progreso (p. ej. abierto)", async () => {
    state.jobs[0].status = "abierto";
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("El trabajo no está en progreso.");
    expect(state.history).toHaveLength(0);
  });

  it("no se puede completar un trabajo ya completado", async () => {
    state.jobs[0].status = "completado";
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("El trabajo no está en progreso.");
  });

  it("sin sesión no se puede completar", async () => {
    state.user = null;
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("un trabajo inexistente devuelve error sin tocar la base de datos", async () => {
    const result = await completeJob("no-existe");
    expect(result.error).toBe("Trabajo no encontrado.");
    expect(state.updates).toHaveLength(0);
  });

  it("un error de UPDATE se propaga como error controlado, sin insertar history", async () => {
    state.jobUpdateError = "db down";
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("No se pudo completar el trabajo.");
    expect(state.history).toHaveLength(0);
  });
});

describe("completeJob() — Fase 8: exige el reporte previo del trabajador", () => {
  beforeEach(() => {
    state.jobs = [{
      id: JOB_A,
      employer_id: EMPLOYER_A,
      positions_needed: 1,
      status: "en_progreso",
      assigned_worker_id: WORKER,
      worker_reported_finished_at: null,
      employer_confirmed_at: null,
      completed_at: null,
      cancelled_at: null,
    }];
  });

  it("84. el empleador NO puede completar unilateralmente sin que el trabajador haya reportado", async () => {
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("El trabajador todavía no reportó el trabajo como terminado.");
    expect(state.jobs[0].status).toBe("en_progreso");
    expect(state.updates).toHaveLength(0);
    expect(state.history).toHaveLength(0);
  });

  it("una vez que el trabajador reporta, el empleador sí puede completar", async () => {
    state.jobs[0].worker_reported_finished_at = "2026-01-01T00:00:00Z";
    const result = await completeJob(JOB_A);
    expect(result).toEqual({ success: true });
    expect(state.jobs[0].status).toBe("completado");
  });

  it("86. después de confirmar: status=completado, employer_confirmed_at y completed_at no nulos", async () => {
    state.jobs[0].worker_reported_finished_at = "2026-01-01T00:00:00Z";
    await completeJob(JOB_A);
    expect(state.jobs[0].status).toBe("completado");
    expect(state.jobs[0].employer_confirmed_at).toEqual(expect.any(String));
    expect(state.jobs[0].completed_at).toEqual(expect.any(String));
  });

  it("una segunda confirmación sobre un job ya confirmado falla de forma controlada (idempotencia) — vía el flujo real: status ya no es en_progreso", async () => {
    state.jobs[0].worker_reported_finished_at = "2026-01-01T00:00:00Z";
    await completeJob(JOB_A); // primera confirmación real
    const result = await completeJob(JOB_A); // segunda, sobre el mismo job ya completado
    expect(result.error).toBe("El trabajo no está en progreso.");
    expect(state.updates).toHaveLength(1); // el segundo intento nunca llega a emitir un UPDATE
  });

  it("guarda defensiva: employer_confirmed_at ya no nulo con status todavía en_progreso (estado inconsistente hipotético) se rechaza explícitamente", async () => {
    state.jobs[0].worker_reported_finished_at = "2026-01-01T00:00:00Z";
    state.jobs[0].employer_confirmed_at = "2026-01-02T00:00:00Z";
    const result = await completeJob(JOB_A);
    expect(result.error).toBe("Este trabajo ya fue confirmado.");
  });

  it("82/83. doble confirmación concurrente: el WHERE del UPDATE solo deja que una tenga efecto — la segunda ve 0 filas afectadas y falla, sin duplicar history", async () => {
    state.jobs[0].worker_reported_finished_at = "2026-01-01T00:00:00Z";
    const [first, second] = await Promise.all([completeJob(JOB_A), completeJob(JOB_A)]);
    const results = [first, second];
    const successes = results.filter((r) => "success" in r && r.success);
    const failures = results.filter((r) => "error" in r && r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(state.history).toHaveLength(1);
  });
});

describe("cancelJob() — comportamiento base (Fase 8, prerequisito)", () => {
  beforeEach(() => {
    state.jobs = [{
      id: JOB_A,
      employer_id: EMPLOYER_A,
      positions_needed: 1,
      status: "abierto",
      cancelled_at: null,
    }];
  });

  it("el empleador dueño puede cancelar un trabajo abierto", async () => {
    const result = await cancelJob(JOB_A);
    expect(result).toEqual({ success: true });
    expect(state.jobs[0].status).toBe("cancelado");
    expect(state.jobs[0].cancelled_at).toEqual(expect.any(String));
  });

  it("inserta una fila en job_state_history (abierto → cancelado)", async () => {
    await cancelJob(JOB_A);
    expect(state.history).toMatchObject([
      { job_id: JOB_A, actor_id: EMPLOYER_A, prev_status: "abierto", new_status: "cancelado" },
    ]);
  });

  it("NO se puede cancelar un trabajo en_progreso — comportamiento actual, confirma que no existe ruta de cancelación tras iniciar el trabajo", async () => {
    state.jobs[0].status = "en_progreso";
    const result = await cancelJob(JOB_A);
    expect(result.error).toBe("Solo puedes cancelar trabajos abiertos.");
    expect(state.jobs[0].status).toBe("en_progreso");
  });

  it("un empleador que no es el dueño no puede cancelar", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await cancelJob(JOB_A);
    expect(result.error).toBe("Sin permiso.");
  });

  it("sin sesión no se puede cancelar", async () => {
    state.user = null;
    const result = await cancelJob(JOB_A);
    expect(result.error).toBe("Debes iniciar sesión.");
  });
});

describe("updateJobStatus() — comportamiento base (Fase 8, prerequisito)", () => {
  beforeEach(() => {
    state.jobs = [{
      id: JOB_A,
      employer_id: EMPLOYER_A,
      positions_needed: 1,
      status: "en_progreso",
    }];
  });

  it("el empleador dueño puede mover en_progreso → completado", async () => {
    const result = await updateJobStatus(JOB_A, "completado");
    expect(result.error).toBeUndefined();
    expect(state.jobs[0].status).toBe("completado");
  });

  it("el empleador dueño puede mover en_progreso → cancelado", async () => {
    const result = await updateJobStatus(JOB_A, "cancelado");
    expect(result.error).toBeUndefined();
    expect(state.jobs[0].status).toBe("cancelado");
  });

  it("NO registra job_state_history — a diferencia de completeJob()/cancelJob(), esta ruta genérica no lo hace hoy", async () => {
    await updateJobStatus(JOB_A, "completado");
    expect(state.history).toHaveLength(0);
  });

  it("un empleador que no es el dueño no puede cambiar el estado", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await updateJobStatus(JOB_A, "completado");
    expect(result.error).toBe("Sin permiso.");
  });

  it("transición no permitida (abierto → completado, saltando en_progreso) es rechazada", async () => {
    state.jobs[0].status = "abierto";
    const result = await updateJobStatus(JOB_A, "completado");
    expect(result.error).toBe("Esa transición de estado no está permitida.");
  });

  it("un estado fuera del enum es rechazado antes de tocar la base de datos", async () => {
    const result = await updateJobStatus(JOB_A, "inventado");
    expect(result.error).toBe("Estado inválido.");
    expect(state.updates).toHaveLength(0);
  });

  it("sin sesión no se puede cambiar el estado", async () => {
    state.user = null;
    const result = await updateJobStatus(JOB_A, "completado");
    expect(result.error).toBe("Debes iniciar sesión.");
  });
});

/**
 * Fase 8 (C4-G21): reportJobFinished() — primera confirmación, del
 * trabajador. NO cambia `status`, solo fija `worker_reported_finished_at`.
 * La autorización real vive en la RLS de 0044_worker_completion_confirmation.sql
 * (validada contra Postgres 16 real, ver informe de implementación); estos
 * tests cubren la capa de Server Action: mensajes de error, idempotencia y
 * que la capa TS no duplique la lógica de autorización de forma distinta
 * a la RLS.
 */
describe("reportJobFinished() — Fase 8", () => {
  beforeEach(() => {
    state.user = { id: WORKER };
    state.jobs = [{
      id: JOB_A,
      employer_id: EMPLOYER_A,
      positions_needed: 1,
      status: "en_progreso",
      assigned_worker_id: WORKER,
      worker_reported_finished_at: null,
      employer_confirmed_at: null,
      completed_at: null,
      cancelled_at: null,
    }];
  });

  it("1. el trabajador asignado puede reportar un trabajo en_progreso", async () => {
    const result = await reportJobFinished(JOB_A);
    expect(result).toEqual({ success: true });
    expect(state.jobs[0].worker_reported_finished_at).toEqual(expect.any(String));
  });

  it("no cambia status — el job permanece en_progreso tras el reporte", async () => {
    await reportJobFinished(JOB_A);
    expect(state.jobs[0].status).toBe("en_progreso");
  });

  it("11. un worker que NO es el asignado no puede reportar (unauthorized)", async () => {
    state.user = { id: WORKER_B };
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("Sin permiso para realizar esta acción.");
    expect(state.jobs[0].worker_reported_finished_at).toBeNull();
  });

  it("el empleador (no el worker) no puede reportar por esta vía", async () => {
    state.user = { id: EMPLOYER_A };
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("Sin permiso para realizar esta acción.");
  });

  it("2. un trabajo inexistente (wrong job) devuelve error sin tocar la base de datos", async () => {
    const result = await reportJobFinished("no-existe");
    expect(result.error).toBe("Trabajo no encontrado.");
    expect(state.updates).toHaveLength(0);
  });

  it("3. no se puede reportar un trabajo que no está en_progreso (wrong status)", async () => {
    state.jobs[0].status = "abierto";
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("El trabajo no está en progreso.");
  });

  it("no se puede reportar un trabajo ya completado", async () => {
    state.jobs[0].status = "completado";
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("El trabajo no está en progreso.");
  });

  it("9. reportar dos veces (duplicate report) — la segunda vez falla de forma controlada, sin duplicar history", async () => {
    await reportJobFinished(JOB_A);
    const second = await reportJobFinished(JOB_A);
    expect(second.error).toBe("Ya reportaste este trabajo como terminado.");
    expect(state.history).toHaveLength(1);
  });

  it("10. dos reportes concurrentes (doble click) — el WHERE del UPDATE solo deja que uno tenga efecto", async () => {
    const [first, second] = await Promise.all([reportJobFinished(JOB_A), reportJobFinished(JOB_A)]);
    const results = [first, second];
    const successes = results.filter((r) => "success" in r && r.success);
    const failures = results.filter((r) => "error" in r && r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(state.history).toHaveLength(1);
  });

  it("sin sesión no se puede reportar", async () => {
    state.user = null;
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("6. registra exactamente una fila en job_state_history, sin cambiar de status (prev=new='en_progreso')", async () => {
    await reportJobFinished(JOB_A);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      job_id: JOB_A,
      actor_id: WORKER,
      prev_status: "en_progreso",
      new_status: "en_progreso",
    });
    expect(state.history[0].notes).toEqual(expect.any(String));
  });

  it("un error de UPDATE se propaga como error controlado, sin insertar history", async () => {
    state.jobUpdateError = "db down";
    const result = await reportJobFinished(JOB_A);
    expect(result.error).toBe("No se pudo reportar el trabajo como terminado.");
    expect(state.history).toHaveLength(0);
  });
});

/**
 * P1 (auditoría post-V6): deleteJob() no tenía autenticación, ownership
 * ni chequeo de status — dependía 100% de RLS (jobs_delete_owner_or_admin,
 * endurecida en 0048_protect_job_deletion.sql para rechazar DELETE sobre
 * estados terminales). Estos tests fijan la segunda capa (Server Action)
 * añadida en esta fase: NO sustituye a RLS (eso se prueba empíricamente
 * contra Postgres real, ver supabase/tests/0048_protect_job_deletion.test.sql),
 * solo da un mensaje de error legible antes de siquiera intentar el DELETE.
 */
describe("deleteJob() — P1: protege jobs terminales contra borrado", () => {
  beforeEach(() => {
    state.jobs = [{ id: JOB_A, employer_id: EMPLOYER_A, positions_needed: 1, status: "abierto" }];
  });

  it("el empleador dueño puede eliminar un job abierto", async () => {
    const result = await deleteJob(JOB_A);
    expect(result.error).toBeUndefined();
    expect(state.jobDeletes).toEqual([JOB_A]);
    expect(state.jobs).toHaveLength(0);
  });

  it("el empleador dueño puede eliminar un job en_progreso", async () => {
    state.jobs[0].status = "en_progreso";
    const result = await deleteJob(JOB_A);
    expect(result.error).toBeUndefined();
    expect(state.jobDeletes).toEqual([JOB_A]);
  });

  it("el empleador dueño NO puede eliminar un job completado", async () => {
    state.jobs[0].status = "completado";
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("No puedes eliminar un trabajo completado o cancelado.");
    expect(state.jobDeletes).toEqual([]);
    expect(state.jobs).toHaveLength(1);
  });

  it("el empleador dueño NO puede eliminar un job cancelado", async () => {
    state.jobs[0].status = "cancelado";
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("No puedes eliminar un trabajo completado o cancelado.");
    expect(state.jobDeletes).toEqual([]);
  });

  it("un empleador que no es el dueño no puede eliminar el job (aunque sea abierto)", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("Sin permiso.");
    expect(state.jobDeletes).toEqual([]);
  });

  it("un worker no puede eliminar el job de otro", async () => {
    state.user = { id: WORKER };
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("Sin permiso.");
    expect(state.jobDeletes).toEqual([]);
  });

  it("sin sesión no se puede eliminar ningún job", async () => {
    state.user = null;
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("Debes iniciar sesión.");
    expect(state.jobDeletes).toEqual([]);
  });

  it("un job inexistente devuelve error sin tocar la base de datos", async () => {
    const result = await deleteJob("no-existe");
    expect(result.error).toBe("Trabajo no encontrado.");
    expect(state.jobDeletes).toEqual([]);
  });

  it("el chequeo de status se hace ANTES del DELETE — un DELETE forzado a fallar nunca se alcanza para un job completado", async () => {
    state.jobs[0].status = "completado";
    state.jobDeleteError = "no debería llegar aquí";
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("No puedes eliminar un trabajo completado o cancelado.");
  });

  it("un error real de DELETE (p. ej. RLS rechazando por una razón no cubierta por este guard) se propaga sin enmascararse", async () => {
    state.jobDeleteError = "db down";
    const result = await deleteJob(JOB_A);
    expect(result.error).toBe("db down");
    expect(state.jobs).toHaveLength(1);
  });
});
