import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getMyAvailability,
  saveAvailability,
  deleteAvailability,
  getProfileAvailability,
  proposeApplicationSchedule,
  confirmApplicationSchedule,
  getMyCalendar,
} from "./calendar";

/**
 * FASE 3F — cobertura de las Server Actions del calendario. Igual que en
 * jobs.test.ts, esto NO prueba las policies RLS ni los triggers de
 * Postgres (0051-0055, ya verificados empíricamente contra Production en
 * las fases anteriores) — fija que la capa TypeScript aplica sus propias
 * comprobaciones de autorización/validación ANTES de tocar la base de
 * datos, y que nunca manda un payload que intente escribir un campo que
 * no le corresponde a quien llama.
 */

interface SlotRow {
  id: string;
  profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface ExceptionRow {
  id: string;
  profile_id: string;
  exception_date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface AppRow {
  id: string;
  status: string;
  worker_id: string;
  job_id: string;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  worker_schedule_confirmed_at: string | null;
}

interface JobRow {
  id: string;
  employer_id: string;
  assigned_worker_id: string | null;
  title: string;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  city: string | null;
  district: string | null;
}

interface PublicProfileRow {
  id: string;
  full_name: string;
}

interface State {
  user: { id: string } | null;
  slots: SlotRow[];
  exceptions: ExceptionRow[];
  applications: AppRow[];
  jobs: JobRow[];
  employerProfiles: PublicProfileRow[];
  workerProfiles: PublicProfileRow[];
  slotInsertError: string | null;
  slotUpdateError: string | null;
  exceptionUpsertError: string | null;
  deleteError: string | null;
  appUpdateError: string | null;
  slotInserts: Record<string, unknown>[];
  exceptionUpserts: Record<string, unknown>[];
  appUpdates: { id: string; payload: Record<string, unknown> }[];
  deletedIds: { table: string; id: string }[];
}

const state: State = {
  user: null,
  slots: [],
  exceptions: [],
  applications: [],
  jobs: [],
  employerProfiles: [],
  workerProfiles: [],
  slotInsertError: null,
  slotUpdateError: null,
  exceptionUpsertError: null,
  deleteError: null,
  appUpdateError: null,
  slotInserts: [],
  exceptionUpserts: [],
  appUpdates: [],
  deletedIds: [],
};

/** Chain de solo-lectura genérica: soporta .eq()/.not() acumulando filtros
 * y es "thenable" (para selects sin .single(), awaited directamente o vía
 * Promise.all) además de exponer .single()/.order() como en supabase-js. */
function makeSelectChain<T>(rows: T[]) {
  const filters: { col: string; op: "eq" | "not-is" | "in"; val: unknown }[] = [];
  const applyFilters = () =>
    rows.filter((row) => {
      const r = row as unknown as Record<string, unknown>;
      return filters.every((f) => {
        if (f.op === "eq") return r[f.col] === f.val;
        if (f.op === "in") return (f.val as unknown[]).includes(r[f.col]);
        return (r[f.col] ?? null) !== f.val;
      });
    });
  const chain = {
    eq(col: string, val: unknown) {
      filters.push({ col, op: "eq", val });
      return chain;
    },
    in(col: string, val: unknown[]) {
      filters.push({ col, op: "in", val });
      return chain;
    },
    not(col: string, _op: string, val: unknown) {
      filters.push({ col, op: "not-is", val });
      return chain;
    },
    order() {
      return chain;
    },
    single: async () => {
      const matches = applyFilters();
      return { data: matches[0] ?? null, error: null };
    },
    then(resolve: (v: { data: T[]; error: null }) => void) {
      resolve({ data: applyFilters(), error: null });
    },
  };
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "profile_availability_slots") {
        return {
          select: () => makeSelectChain(state.slots),
          insert: async (payload: Record<string, unknown>) => {
            if (state.slotInsertError) return { error: { message: state.slotInsertError } };
            state.slotInserts.push(payload);
            state.slots.push({ id: `new-slot-${state.slots.length}`, ...payload } as SlotRow);
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(resolve: (v: { error: unknown }) => void) {
                if (state.slotUpdateError) {
                  resolve({ error: { message: state.slotUpdateError } });
                  return;
                }
                const row = state.slots.find((s) => s.id === filters.id);
                if (row) Object.assign(row, payload);
                resolve({ error: null });
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
              then(resolve: (v: { error: unknown }) => void) {
                if (state.deleteError) {
                  resolve({ error: { message: state.deleteError } });
                  return;
                }
                state.slots = state.slots.filter((s) => s.id !== filters.id);
                state.deletedIds.push({ table, id: filters.id as string });
                resolve({ error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "profile_availability_exceptions") {
        return {
          select: () => makeSelectChain(state.exceptions),
          upsert: async (payload: Record<string, unknown>) => {
            if (state.exceptionUpsertError) return { error: { message: state.exceptionUpsertError } };
            state.exceptionUpserts.push(payload);
            const existing = state.exceptions.find(
              (e) => e.profile_id === payload.profile_id && e.exception_date === payload.exception_date
            );
            if (existing) Object.assign(existing, payload);
            else state.exceptions.push({ id: `new-exc-${state.exceptions.length}`, ...payload } as ExceptionRow);
            return { error: null };
          },
          delete: () => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(resolve: (v: { error: unknown }) => void) {
                if (state.deleteError) {
                  resolve({ error: { message: state.deleteError } });
                  return;
                }
                state.exceptions = state.exceptions.filter((e) => e.id !== filters.id);
                state.deletedIds.push({ table, id: filters.id as string });
                resolve({ error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "job_applications") {
        return {
          select: () => makeSelectChain(state.applications),
          update: (payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(resolve: (v: { error: unknown }) => void) {
                if (state.appUpdateError) {
                  resolve({ error: { message: state.appUpdateError } });
                  return;
                }
                const row = state.applications.find((a) => a.id === filters.id);
                if (row) {
                  state.appUpdates.push({ id: row.id, payload });
                  Object.assign(row, payload);
                }
                resolve({ error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "jobs") {
        return {
          select: () => makeSelectChain(state.jobs),
        };
      }
      if (table === "public_profiles") {
        return { select: () => makeSelectChain(state.employerProfiles) };
      }
      if (table === "public_workers") {
        return { select: () => makeSelectChain(state.workerProfiles) };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

const WORKER = "33333333-3333-4333-8333-333333333333";
const WORKER_B = "55555555-5555-4555-8555-555555555555";
const EMPLOYER_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYER_B = "22222222-2222-4222-8222-222222222222";
const JOB_A = "aaaaaaaa-1111-4111-8111-111111111111";
const JOB_B = "aaaaaaaa-2222-4222-8222-222222222222";
const APP_A = "bbbbbbbb-1111-4111-8111-111111111111";
const SLOT_WORKER = "cccccccc-1111-4111-8111-111111111111";
const SLOT_OTHER = "cccccccc-2222-4222-8222-222222222222";
const EXC_WORKER = "dddddddd-1111-4111-8111-111111111111";

beforeEach(() => {
  state.user = { id: WORKER };
  state.slots = [
    { id: SLOT_WORKER, profile_id: WORKER, day_of_week: 1, start_time: "09:00", end_time: "12:00", is_active: true },
    { id: SLOT_OTHER, profile_id: WORKER_B, day_of_week: 2, start_time: "10:00", end_time: "14:00", is_active: true },
  ];
  state.exceptions = [
    { id: EXC_WORKER, profile_id: WORKER, exception_date: "2099-12-24", is_available: false, start_time: null, end_time: null },
  ];
  state.applications = [
    {
      id: APP_A,
      status: "pendiente",
      worker_id: WORKER,
      job_id: JOB_A,
      proposed_start_at: null,
      proposed_end_at: null,
      worker_schedule_confirmed_at: null,
    },
  ];
  state.jobs = [
    { id: JOB_A, employer_id: EMPLOYER_A, assigned_worker_id: null, title: "Job A", status: "abierto", scheduled_start_at: null, scheduled_end_at: null, city: "Chiclayo", district: "Chiclayo" },
    { id: JOB_B, employer_id: EMPLOYER_A, assigned_worker_id: WORKER, title: "Job B", status: "en_progreso", scheduled_start_at: "2099-01-01T10:00:00Z", scheduled_end_at: "2099-01-01T12:00:00Z", city: "Chiclayo", district: "José Leonardo Ortiz" },
  ];
  state.employerProfiles = [{ id: EMPLOYER_A, full_name: "Empleador A" }];
  state.workerProfiles = [{ id: WORKER, full_name: "Trabajador Worker" }];
  state.slotInsertError = null;
  state.slotUpdateError = null;
  state.exceptionUpsertError = null;
  state.deleteError = null;
  state.appUpdateError = null;
  state.slotInserts = [];
  state.exceptionUpserts = [];
  state.appUpdates = [];
  state.deletedIds = [];
});

describe("1. usuario no autenticado", () => {
  it("getMyAvailability() exige sesión", async () => {
    state.user = null;
    const result = await getMyAvailability();
    expect(result).toEqual({ error: "Debes iniciar sesión." });
  });

  it("saveAvailability() exige sesión", async () => {
    state.user = null;
    const result = await saveAvailability({ kind: "slot", day_of_week: 1, start_time: "09:00", end_time: "10:00" });
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("deleteAvailability() exige sesión", async () => {
    state.user = null;
    const result = await deleteAvailability("slot", SLOT_WORKER);
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("proposeApplicationSchedule() exige sesión", async () => {
    state.user = null;
    const result = await proposeApplicationSchedule(APP_A, "2099-01-01T10:00:00Z", "2099-01-01T12:00:00Z");
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("confirmApplicationSchedule() exige sesión", async () => {
    state.user = null;
    const result = await confirmApplicationSchedule(APP_A);
    expect(result.error).toBe("Debes iniciar sesión.");
  });

  it("getMyCalendar() exige sesión", async () => {
    state.user = null;
    const result = await getMyCalendar();
    expect(result).toEqual({ error: "Debes iniciar sesión." });
  });
});

describe("2. worker accede a su disponibilidad", () => {
  it("getMyAvailability() devuelve solo los slots/excepciones propios del worker", async () => {
    const result = await getMyAvailability();
    if ("error" in result) throw new Error("no debería fallar");
    expect(result.slots).toEqual([state.slots[0]]);
    expect(result.exceptions).toEqual([state.exceptions[0]]);
  });
});

describe("3. worker no puede modificar disponibilidad ajena", () => {
  it("saveAvailability() rechaza actualizar un slot de otro perfil", async () => {
    const result = await saveAvailability({
      kind: "slot",
      id: SLOT_OTHER,
      day_of_week: 3,
      start_time: "09:00",
      end_time: "10:00",
    });
    expect(result.error).toBe("Sin permiso.");
    expect(state.slots.find((s) => s.id === SLOT_OTHER)).toMatchObject({ day_of_week: 2 });
  });

  it("deleteAvailability() rechaza borrar un slot de otro perfil", async () => {
    const result = await deleteAvailability("slot", SLOT_OTHER);
    expect(result.error).toBe("Sin permiso.");
    expect(state.slots.some((s) => s.id === SLOT_OTHER)).toBe(true);
  });

  it("saveAvailability() nunca acepta un profile_id explícito del caller: siempre usa auth.uid()", async () => {
    // El tipo de entrada ni siquiera expone profile_id — esto confirma en
    // tiempo de ejecución que lo insertado usa el id de la sesión.
    await saveAvailability({ kind: "slot", day_of_week: 4, start_time: "08:00", end_time: "09:00" });
    expect(state.slotInserts[0]).toMatchObject({ profile_id: WORKER });
  });
});

describe("4. employer puede gestionar su disponibilidad", () => {
  beforeEach(() => {
    state.user = { id: EMPLOYER_A };
    state.slots = [];
  });

  it("un empleador puede crear su propio slot recurrente", async () => {
    const result = await saveAvailability({ kind: "slot", day_of_week: 0, start_time: "08:00", end_time: "13:00" });
    expect(result).toEqual({ success: true });
    expect(state.slotInserts[0]).toMatchObject({ profile_id: EMPLOYER_A, day_of_week: 0 });
  });

  it("un empleador puede actualizar su propio slot", async () => {
    state.slots = [{ id: "slot-emp", profile_id: EMPLOYER_A, day_of_week: 0, start_time: "08:00", end_time: "12:00", is_active: true }];
    const result = await saveAvailability({ kind: "slot", id: "slot-emp", day_of_week: 0, start_time: "09:00", end_time: "13:00" });
    expect(result).toEqual({ success: true });
    expect(state.slots[0]).toMatchObject({ start_time: "09:00", end_time: "13:00" });
  });

  it("validaciones: day_of_week fuera de 0-6 se rechaza", async () => {
    const result = await saveAvailability({ kind: "slot", day_of_week: 7, start_time: "08:00", end_time: "09:00" });
    expect(result.error).toBe("Día de la semana inválido.");
  });

  it("validaciones: start_time >= end_time se rechaza", async () => {
    const result = await saveAvailability({ kind: "slot", day_of_week: 1, start_time: "10:00", end_time: "09:00" });
    expect(result.error).toBe("La hora de inicio debe ser anterior a la hora de fin.");
  });

  it("excepciones: is_available=true exige horario completo", async () => {
    const result = await saveAvailability({ kind: "exception", exception_date: "2099-05-01", is_available: true });
    expect(result.error).toBe("Debes indicar un horario completo para un día disponible.");
  });

  it("excepciones: is_available=false no permite horario", async () => {
    const result = await saveAvailability({
      kind: "exception",
      exception_date: "2099-05-01",
      is_available: false,
      start_time: "09:00",
      end_time: "10:00",
    });
    expect(result.error).toBe("Un día marcado como no disponible no puede tener horario.");
  });

  it("excepciones: fecha inválida se rechaza", async () => {
    const result = await saveAvailability({ kind: "exception", exception_date: "01-05-2099", is_available: false });
    expect(result.error).toBe("Fecha inválida.");
  });

  it("excepciones: guardar una excepción válida hace upsert con el profile_id propio", async () => {
    const result = await saveAvailability({
      kind: "exception",
      exception_date: "2099-05-01",
      is_available: true,
      start_time: "09:00",
      end_time: "12:00",
    });
    expect(result).toEqual({ success: true });
    expect(state.exceptionUpserts[0]).toMatchObject({ profile_id: EMPLOYER_A, exception_date: "2099-05-01" });
  });
});

describe("getProfileAvailability() — lectura pública", () => {
  it("devuelve la disponibilidad de cualquier perfil sin requerir sesión propia", async () => {
    state.user = null;
    const result = await getProfileAvailability(WORKER);
    expect(result.slots).toEqual([state.slots[0]]);
    expect(result.exceptions).toEqual([state.exceptions[0]]);
  });

  it("solo devuelve slots activos", async () => {
    state.slots.push({ id: "inactive", profile_id: WORKER, day_of_week: 5, start_time: "08:00", end_time: "09:00", is_active: false });
    const result = await getProfileAvailability(WORKER);
    expect(result.slots.some((s) => s.id === "inactive")).toBe(false);
  });
});

describe("5-6. proposeApplicationSchedule() — propuesta válida e inválida", () => {
  beforeEach(() => {
    state.user = { id: EMPLOYER_A };
  });

  it("5. el empleador dueño propone un horario válido", async () => {
    const result = await proposeApplicationSchedule(APP_A, "2099-02-01T10:00:00Z", "2099-02-01T12:00:00Z");
    expect(result).toEqual({ success: true });
    expect(state.appUpdates[0]).toMatchObject({
      id: APP_A,
      payload: {
        proposed_start_at: "2099-02-01T10:00:00.000Z",
        proposed_end_at: "2099-02-01T12:00:00.000Z",
      },
    });
    // Nunca debe tocar worker_schedule_confirmed_at.
    expect(state.appUpdates[0].payload).not.toHaveProperty("worker_schedule_confirmed_at");
  });

  it("6a. horario inválido (fin <= inicio) se rechaza", async () => {
    const result = await proposeApplicationSchedule(APP_A, "2099-02-01T12:00:00Z", "2099-02-01T10:00:00Z");
    expect(result.error).toBe("La hora de fin debe ser posterior a la hora de inicio.");
    expect(state.appUpdates).toHaveLength(0);
  });

  it("6b. fechas no parseables se rechazan", async () => {
    const result = await proposeApplicationSchedule(APP_A, "no-es-fecha", "tampoco");
    expect(result.error).toBe("Horario inválido.");
  });

  it("6c. un empleador que no es dueño del job no puede proponer horario", async () => {
    state.user = { id: EMPLOYER_B };
    const result = await proposeApplicationSchedule(APP_A, "2099-02-01T10:00:00Z", "2099-02-01T12:00:00Z");
    expect(result.error).toBe("Sin permiso.");
    expect(state.appUpdates).toHaveLength(0);
  });

  it("6d. el worker no puede proponerse horario a sí mismo", async () => {
    state.user = { id: WORKER };
    const result = await proposeApplicationSchedule(APP_A, "2099-02-01T10:00:00Z", "2099-02-01T12:00:00Z");
    expect(result.error).toBe("Sin permiso.");
  });

  it("10a. no se puede proponer horario en una postulación que no está pendiente", async () => {
    state.applications[0].status = "aceptado";
    const result = await proposeApplicationSchedule(APP_A, "2099-02-01T10:00:00Z", "2099-02-01T12:00:00Z");
    expect(result.error).toBe("Solo puedes proponer horario en postulaciones pendientes.");
  });
});

describe("7-9. confirmApplicationSchedule()", () => {
  beforeEach(() => {
    state.applications[0].proposed_start_at = "2099-02-01T10:00:00.000Z";
    state.applications[0].proposed_end_at = "2099-02-01T12:00:00.000Z";
  });

  it("7. el worker dueño confirma una propuesta completa", async () => {
    state.user = { id: WORKER };
    const result = await confirmApplicationSchedule(APP_A);
    expect(result).toEqual({ success: true });
    expect(state.appUpdates[0]).toMatchObject({ id: APP_A });
    expect(state.appUpdates[0].payload).toHaveProperty("worker_schedule_confirmed_at");
  });

  it("8. confirmar nunca incluye proposed_start_at/proposed_end_at en el payload (el worker no puede modificar la propuesta por esta vía)", async () => {
    state.user = { id: WORKER };
    await confirmApplicationSchedule(APP_A);
    expect(state.appUpdates[0].payload).not.toHaveProperty("proposed_start_at");
    expect(state.appUpdates[0].payload).not.toHaveProperty("proposed_end_at");
  });

  it("9. el empleador NO puede confirmar por el worker", async () => {
    state.user = { id: EMPLOYER_A };
    const result = await confirmApplicationSchedule(APP_A);
    expect(result.error).toBe("Sin permiso.");
    expect(state.appUpdates).toHaveLength(0);
  });

  it("un worker distinto al dueño de la postulación no puede confirmarla", async () => {
    state.user = { id: WORKER_B };
    const result = await confirmApplicationSchedule(APP_A);
    expect(result.error).toBe("Sin permiso.");
  });

  it("no se puede confirmar sin una propuesta completa previa", async () => {
    state.applications[0].proposed_start_at = null;
    state.applications[0].proposed_end_at = null;
    state.user = { id: WORKER };
    const result = await confirmApplicationSchedule(APP_A);
    expect(result.error).toBe("El empleador todavía no propuso un horario.");
  });

  it("10b. no se puede confirmar una postulación que no está pendiente", async () => {
    state.applications[0].status = "aceptado";
    state.user = { id: WORKER };
    const result = await confirmApplicationSchedule(APP_A);
    expect(result.error).toBe("Solo puedes confirmar horario en postulaciones pendientes.");
  });
});

describe("11-13. getMyCalendar()", () => {
  it("11. como worker devuelve los jobs con horario donde está asignado, con el nombre del empleador y la ubicación", async () => {
    state.user = { id: WORKER };
    const result = await getMyCalendar();
    if ("error" in result) throw new Error("no debería fallar");
    expect(result.asWorker.map((j) => j.id)).toEqual([JOB_B]);
    expect(result.asWorker[0]).toMatchObject({
      counterpartName: "Empleador A",
      district: "José Leonardo Ortiz",
    });
    expect(result.asEmployer).toEqual([]);
  });

  it("12. como empleador devuelve los jobs con horario de sus publicaciones, con el nombre del trabajador asignado", async () => {
    state.user = { id: EMPLOYER_A };
    const result = await getMyCalendar();
    if ("error" in result) throw new Error("no debería fallar");
    expect(result.asEmployer.map((j) => j.id)).toEqual([JOB_B]);
    expect(result.asEmployer[0]).toMatchObject({ counterpartName: "Trabajador Worker" });
    expect(result.asWorker).toEqual([]);
  });

  it("13. un usuario multi-role (worker Y employer del mismo job) ve ambas listas sin depender de profiles.role", async () => {
    // WORKER también es dueño de un job propio con horario (multi-role) —
    // getMyCalendar() nunca lee profiles.role, solo filtra por
    // assigned_worker_id/employer_id, así que ambas listas se resuelven
    // igual sin importar el "modo activo" del usuario.
    state.jobs.push({
      id: "job-multi",
      employer_id: WORKER,
      assigned_worker_id: null,
      title: "Job propio del multi-role",
      status: "abierto",
      scheduled_start_at: "2099-03-01T09:00:00Z",
      scheduled_end_at: "2099-03-01T10:00:00Z",
      city: "Chiclayo",
      district: "Chiclayo",
    });
    state.user = { id: WORKER };
    const result = await getMyCalendar();
    if ("error" in result) throw new Error("no debería fallar");
    expect(result.asWorker.map((j) => j.id)).toEqual([JOB_B]);
    expect(result.asEmployer.map((j) => j.id)).toEqual(["job-multi"]);
  });

  it("no incluye jobs sin horario confirmado (scheduled_start_at NULL)", async () => {
    state.user = { id: EMPLOYER_A };
    const result = await getMyCalendar();
    if ("error" in result) throw new Error("no debería fallar");
    expect(result.asEmployer.some((j) => j.id === JOB_A)).toBe(false);
  });
});
