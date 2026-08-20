import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateApplicationStatus } from "./jobs";

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
}

const state: State = {
  user: null,
  applications: [],
  jobs: [],
  updateError: null,
  updates: [],
  jobColumnsRequested: [],
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
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const EMPLOYER_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYER_B = "22222222-2222-4222-8222-222222222222";
const WORKER = "33333333-3333-4333-8333-333333333333";
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
