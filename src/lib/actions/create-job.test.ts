import { describe, expect, it, vi, beforeEach } from "vitest";
import { createJob } from "./jobs";

/**
 * Cobertura de `createJob()` — Fase 1 de ubicación jerárquica
 * (department/province/district reemplazan el campo `city` de texto
 * libre en NewJobForm.tsx). Verifica que la Server Action valida la
 * jerarquía contra el catálogo (src/lib/ubigeo.ts) del lado del
 * servidor — nunca confía únicamente en lo que envía el cliente — y que
 * `city` (NOT NULL) se sigue completando automáticamente a partir del
 * distrito elegido, para no dejar sin valor una columna que el resto de
 * la app todavía lee.
 */

interface InsertedRow {
  payload: Record<string, unknown>;
}

const state: {
  user: { id: string } | null;
  inserted: InsertedRow[];
  insertError: string | null;
} = {
  user: null,
  inserted: [],
  insertError: null,
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== "jobs") throw new Error(`Tabla no mockeada: ${table}`);
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (state.insertError) {
                return { data: null, error: { message: state.insertError } };
              }
              state.inserted.push({ payload });
              return { data: { id: "new-job-id" }, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

const EMPLOYER = "11111111-1111-4111-8111-111111111111";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    title: "Electricista para obra en San Isidro",
    description: "Necesitamos un electricista con experiencia certificada en instalaciones.",
    category: "Electricista",
    department: "Lambayeque",
    province: "Chiclayo",
    district: "Pimentel",
    pay_type: "fijo",
    positions_needed: "1",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  state.user = { id: EMPLOYER };
  state.inserted = [];
  state.insertError = null;
});

describe("createJob — ubicación jerárquica (Fase 1)", () => {
  it("A) una jerarquía válida se guarda: department/province/district correctos y city derivado del distrito", async () => {
    // En producción redirect() nunca retorna (lanza NEXT_REDIRECT); el
    // mock de next/navigation es un no-op, así que createJob() simplemente
    // termina sin valor de retorno tras el insert exitoso — por eso no se
    // afirma sobre `result` aquí, solo sobre lo que quedó insertado.
    await createJob({}, buildFormData());
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].payload).toMatchObject({
      department: "Lambayeque",
      province: "Chiclayo",
      district: "Pimentel",
      city: "Pimentel",
      employer_id: EMPLOYER,
    });
  });

  it("B) departamento inexistente en el catálogo se rechaza antes de tocar la base de datos", async () => {
    const result = await createJob({}, buildFormData({ department: "Narnia" }));
    expect(result.error).toBeTruthy();
    expect(state.inserted).toHaveLength(0);
  });

  it("C) provincia que no pertenece al departamento indicado se rechaza (el cliente no es fuente de verdad)", async () => {
    const result = await createJob(
      {},
      buildFormData({ department: "La Libertad", province: "Chiclayo", district: "Chiclayo" })
    );
    expect(result.error).toBeTruthy();
    expect(state.inserted).toHaveLength(0);
  });

  it("D) distrito que no pertenece a la provincia indicada se rechaza", async () => {
    const result = await createJob(
      {},
      buildFormData({ department: "Lambayeque", province: "Ferreñafe", district: "Pimentel" })
    );
    expect(result.error).toBeTruthy();
    expect(state.inserted).toHaveLength(0);
  });

  it("E) departamento/provincia/distrito vacíos se rechazan (zod exige los tres no vacíos)", async () => {
    const result = await createJob({}, buildFormData({ department: "", province: "", district: "" }));
    expect(result.error).toBeTruthy();
    expect(state.inserted).toHaveLength(0);
  });

  it("F) sin sesión no se puede publicar un trabajo", async () => {
    state.user = null;
    const result = await createJob({}, buildFormData());
    expect(result.error).toBe("Debes iniciar sesión.");
    expect(state.inserted).toHaveLength(0);
  });

  it("G) un error de base de datos se propaga sin enmascararse", async () => {
    state.insertError = "constraint violation";
    const result = await createJob({}, buildFormData());
    expect(result.error).toBe("No se pudo publicar el trabajo. Intenta nuevamente.");
  });
});
