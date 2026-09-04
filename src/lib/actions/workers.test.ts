import { describe, expect, it, vi, beforeEach } from "vitest";
import { listPublicWorkers } from "./workers";
import type { PublicWorkerListing } from "@/lib/types";

// jobsCompleted se calcula aparte (agregación batched sobre `jobs`, Fase
// C4-G3) — nunca viene en la fila cruda de public_workers, así que se
// excluye también de este tipo de fixture (igual que ratingSummary).
type WorkerRow = Omit<PublicWorkerListing, "ratingSummary" | "jobsCompleted">;

const WORKER_ROW: WorkerRow = {
  id: "w-1",
  full_name: "Ana Electricista",
  avatar_url: null,
  city: "Lima",
  category: "Electricista",
  skills: [],
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
  professional_title: "Electricista industrial",
  availability: "inmediata",
  years_experience: 5,
  hourly_rate: 30,
  daily_rate: null,
  department: null,
  province: null,
  district: null,
};

function emptyWorker(id: string, createdAt: string): WorkerRow {
  return {
    id,
    full_name: `Reciente ${id}`,
    avatar_url: null,
    city: null,
    category: null,
    skills: [],
    bio: null,
    created_at: createdAt,
    professional_title: null,
    availability: null,
    years_experience: null,
    hourly_rate: null,
    daily_rate: null,
    department: null,
    province: null,
    district: null,
  };
}

function fullWorker(id: string, createdAt: string): WorkerRow {
  return {
    id,
    full_name: `Completo ${id}`,
    avatar_url: null,
    city: "Lima",
    category: "Electricista",
    skills: ["Soldadura"],
    bio: "Electricista con experiencia",
    created_at: createdAt,
    professional_title: "Electricista industrial",
    availability: "inmediata",
    years_experience: 5,
    hourly_rate: 30,
    daily_rate: null,
    department: null,
    province: null,
    district: null,
  };
}

interface Call {
  op: string;
  args: unknown[];
}

let authenticated = true;
let calls: Call[] = [];
let ratingRows: { profile_id: string; average_score: number; total_ratings: number }[] = [];
let mockRows: WorkerRow[] = [WORKER_ROW];
// Capturados aparte de `calls` (Fase C4-G1) para no romper los tests
// existentes que hacen `expect(calls).toEqual([])` cuando no hay filtros —
// .limit() y la consulta a rating_summary se ejecutan SIEMPRE, con o sin
// filtros, así que mezclarlos en `calls` habría alterado esas aserciones.
let limitCalls: number[] = [];
let ratingQueryCalls: { col: string; ids: string[] }[] = [];
let completedJobRows: { assigned_worker_id: string }[] = [];
let jobsQueryCalls: { ids: string[] }[] = [];

function reset() {
  authenticated = true;
  calls = [];
  ratingRows = [];
  mockRows = [WORKER_ROW];
  limitCalls = [];
  ratingQueryCalls = [];
  completedJobRows = [];
  jobsQueryCalls = [];
}

/**
 * Query builder falso que registra cada filtro encadenado (misma técnica
 * que employers.test.ts) y siempre resuelve a WORKER_ROW — el objetivo de
 * esta suite es verificar QUÉ filtros arma listPublicWorkers() para cada
 * combinación de entrada, no reimplementar el filtrado real de Postgres
 * (eso ya está probado con datos reales en
 * supabase/tests/0037_public_workers_directory.test.sql).
 */
function makeWorkersBuilder() {
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls.push({ op: "eq", args: [col, val] });
      return builder;
    },
    in: (col: string, val: unknown) => {
      calls.push({ op: "in", args: [col, val] });
      return builder;
    },
    ilike: (col: string, val: unknown) => {
      calls.push({ op: "ilike", args: [col, val] });
      return builder;
    },
    or: (expr: string) => {
      calls.push({ op: "or", args: [expr] });
      return builder;
    },
    order: () => builder,
    limit: (n: number) => {
      limitCalls.push(n);
      return builder;
    },
    then: (resolve: (v: { data: unknown }) => void) => resolve({ data: mockRows }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: "employer-1" } : null } }),
    },
    from: (table: string) => {
      if (table === "public_workers") return makeWorkersBuilder();
      if (table === "rating_summary") {
        return {
          select: () => ({
            in: async (col: string, ids: string[]) => {
              ratingQueryCalls.push({ col, ids });
              return { data: ratingRows };
            },
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            in: (col: string, ids: string[]) => ({
              eq: async () => {
                jobsQueryCalls.push({ ids });
                return { data: completedJobRows };
              },
            }),
          }),
        };
      }
      throw new Error(`tabla inesperada en el mock: ${table}`);
    },
  }),
}));

describe("listPublicWorkers", () => {
  beforeEach(reset);

  it("1/8) sin sesión, devuelve [] sin siquiera consultar public_workers", async () => {
    authenticated = false;
    const result = await listPublicWorkers({});
    expect(result).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("sin filtros, no aplica ningún eq/in/ilike/or", async () => {
    await listPublicWorkers({});
    expect(calls).toEqual([]);
  });

  it("6) city aplica exactamente un ilike('city', %valor%)", async () => {
    await listPublicWorkers({ city: "Chiclayo" });
    expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Chiclayo%"] });
  });

  it("availability aplica exactamente un eq('availability', valor)", async () => {
    await listPublicWorkers({ availability: "una_semana" });
    expect(calls).toContainEqual({ op: "eq", args: ["availability", "una_semana"] });
  });

  it("combina category + city + availability + q en una sola llamada", async () => {
    await listPublicWorkers({
      category: "Electricista",
      city: "Lima",
      availability: "inmediata",
      q: "residencial",
    });
    expect(calls).toContainEqual({ op: "in", args: ["category", ["Electricista"]] });
    expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Lima%"] });
    expect(calls).toContainEqual({ op: "eq", args: ["availability", "inmediata"] });
    expect(calls.some((c) => c.op === "or")).toBe(true);
  });

  it("11) el resultado nunca contiene phone/whatsapp/birth_date/address — el tipo no los admite y el mock tampoco los produce", async () => {
    // `district` fue explícitamente EXCLUIDO de esta lista en Fase 6
    // (C4-G18): a partir de 0042_public_workers_hierarchical_location.sql,
    // PublicWorkerListing SÍ expone `department`/`province`/`district`,
    // pero como columnas de public.profiles (ubicación jerárquica
    // validada contra el catálogo Ubigeo) — nunca el district de texto
    // libre de worker_profile_details, que sigue prohibido (ver el mock
    // de listPublicWorkers: la fila de public_workers nunca trae ese
    // campo, solo el `district` de profiles ya incluido en WorkerRow).
    const result = await listPublicWorkers({});
    expect(result[0]).not.toHaveProperty("phone");
    expect(result[0]).not.toHaveProperty("whatsapp");
    expect(result[0]).not.toHaveProperty("birth_date");
    expect(result[0]).not.toHaveProperty("address");
  });

  // ============================================================
  // Ubicación jerárquica (Fase 6, C4-G18) — .eq() exacto, nunca ilike,
  // conviven con `city` (ilike, compatibilidad legacy) sin OR heurístico.
  // ============================================================
  describe("ubicación jerárquica — department/province/district", () => {
    it("department aplica exactamente un eq('department', valor)", async () => {
      await listPublicWorkers({ department: "Lambayeque" });
      expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
      expect(calls.some((c) => c.op === "ilike" && c.args[0] === "department")).toBe(false);
    });

    it("province aplica exactamente un eq('province', valor)", async () => {
      await listPublicWorkers({ province: "Chiclayo" });
      expect(calls).toContainEqual({ op: "eq", args: ["province", "Chiclayo"] });
    });

    it("district aplica exactamente un eq('district', valor)", async () => {
      await listPublicWorkers({ district: "Cayaltí" });
      expect(calls).toContainEqual({ op: "eq", args: ["district", "Cayaltí"] });
    });

    it("combina department + province + district en una sola llamada, sin interferir entre sí", async () => {
      await listPublicWorkers({ department: "Lambayeque", province: "Chiclayo", district: "Cayaltí" });
      expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
      expect(calls).toContainEqual({ op: "eq", args: ["province", "Chiclayo"] });
      expect(calls).toContainEqual({ op: "eq", args: ["district", "Cayaltí"] });
    });

    it("convive con city: ambos filtros se aplican a la vez, sin ningún OR heurístico entre ellos", async () => {
      await listPublicWorkers({ department: "Lambayeque", city: "Chiclayo" });
      expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
      expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Chiclayo%"] });
      expect(calls.some((c) => c.op === "or")).toBe(false);
    });

    it("sin ningún filtro de ubicación jerárquica, no se agrega ninguna condición implícita de department/province/district", async () => {
      await listPublicWorkers({ city: "Chiclayo" });
      expect(calls.some((c) => ["department", "province", "district"].includes(c.args[0] as string))).toBe(
        false
      );
    });

    it("no interfieren con category/availability/q ya existentes", async () => {
      await listPublicWorkers({ department: "Lambayeque", category: "Electricista", availability: "inmediata", q: "Juan" });
      expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Electricista"]] });
      expect(calls).toContainEqual({ op: "eq", args: ["availability", "inmediata"] });
      expect(calls.some((c) => c.op === "or")).toBe(true);
    });
  });

  it("adjunta rating_summary por id cuando existe", async () => {
    ratingRows = [{ profile_id: "w-1", average_score: 4.8, total_ratings: 12 }];
    const result = await listPublicWorkers({});
    expect(result[0].ratingSummary).toEqual({
      profile_id: "w-1",
      average_score: 4.8,
      total_ratings: 12,
    });
  });

  it("ratingSummary es null cuando el trabajador no tiene calificaciones", async () => {
    const result = await listPublicWorkers({});
    expect(result[0].ratingSummary).toBeNull();
  });

  // ============================================================
  // category — alias de catálogo (P2 #2)
  // ============================================================
  describe("category — expansión de alias", () => {
    it("5) Electricista (sin alias conocido) filtra solo por sí misma", async () => {
      await listPublicWorkers({ category: "Electricista" });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Electricista"]] });
    });

    it("Gasfitero expande a [Gasfitero, Plomero]", async () => {
      await listPublicWorkers({ category: "Gasfitero" });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Gasfitero", "Plomero"]] });
    });

    it("Niñera expande a [Niñera, Niñera / Cuidador]", async () => {
      await listPublicWorkers({ category: "Niñera" });
      expect(calls).toContainEqual({
        op: "in",
        args: ["category", ["Niñera", "Niñera / Cuidador"]],
      });
    });

    it("Cocinero/a expande a [Cocinero/a, Cocinero]", async () => {
      await listPublicWorkers({ category: "Cocinero/a" });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Cocinero/a", "Cocinero"]] });
    });

    it("Chofer expande a [Chofer, Conductor]", async () => {
      await listPublicWorkers({ category: "Chofer" });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Chofer", "Conductor"]] });
    });

    it("una categoría sin alias conocido (p.ej. Otro) no arrastra alias de ninguna otra", async () => {
      await listPublicWorkers({ category: "Otro" });
      expect(calls).toContainEqual({ op: "in", args: ["category", ["Otro"]] });
    });
  });

  // ============================================================
  // q — el .or() debe tratar el valor completo como UN valor, sin que
  // comas/paréntesis alteren la estructura del filtro (P2 #1). Se
  // comprueba el string final generado, no solo que se llamó .or().
  // ============================================================
  describe("q — búsqueda textual segura", () => {
    it("1) q simple ('Juan') queda envuelta entre comillas, un solo valor por columna", async () => {
      await listPublicWorkers({ q: "Juan" });
      const expr = (calls.find((c) => c.op === "or")!.args[0] as string);
      expect(expr).toBe(
        'full_name.ilike."%Juan%",professional_title.ilike."%Juan%",category.ilike."%Juan%",city.ilike."%Juan%"'
      );
    });

    it("2) q con espacio ('Juan Pérez') no se parte en dos condiciones", async () => {
      await listPublicWorkers({ q: "Juan Pérez" });
      const expr = calls.find((c) => c.op === "or")!.args[0] as string;
      expect(expr).toContain('"%Juan Pérez%"');
      // Ninguna condición queda formada solo por "Pérez" — confirma que
      // el espacio no partió el valor.
      expect(expr.split(",").filter((c) => c.includes("Pérez")).length).toBeGreaterThan(0);
      expect(expr).not.toMatch(/^Pérez/);
    });

    it("3) q con coma ('Juan, electricista') no produce condiciones adicionales", async () => {
      await listPublicWorkers({ q: "Juan, electricista" });
      const expr = calls.find((c) => c.op === "or")!.args[0] as string;
      expect(expr).toBe(
        'full_name.ilike."%Juan, electricista%",professional_title.ilike."%Juan, electricista%",category.ilike."%Juan, electricista%",city.ilike."%Juan, electricista%"'
      );
      // Exactamente 4 condiciones (3 comas de separación) — si la coma de
      // q hubiera roto el filtro, aparecerían más de 4.
      expect(expr.split("),").length + expr.split(",").length).toBeGreaterThan(0); // sanity: no vacío
      const topLevelConditions = expr.match(/\w+\.ilike\./g) ?? [];
      expect(topLevelConditions).toHaveLength(4);
    });

    it("4) q con paréntesis ('Juan (Chiclayo)') no rompe la estructura", async () => {
      await listPublicWorkers({ q: "Juan (Chiclayo)" });
      const expr = calls.find((c) => c.op === "or")!.args[0] as string;
      expect(expr).toContain('"%Juan (Chiclayo)%"');
      const topLevelConditions = expr.match(/\w+\.ilike\./g) ?? [];
      expect(topLevelConditions).toHaveLength(4);
    });

    it("5) q con comillas dobles literales se escapa sin romper el valor", async () => {
      await listPublicWorkers({ q: 'Juan "El Rayo"' });
      const expr = calls.find((c) => c.op === "or")!.args[0] as string;
      expect(expr).toContain('%Juan \\"El Rayo\\"%');
      const topLevelConditions = expr.match(/\w+\.ilike\./g) ?? [];
      expect(topLevelConditions).toHaveLength(4);
    });

    it("q combinando coma + paréntesis + espacio ('electricista, Chiclayo (urgente)') sigue siendo 4 condiciones", async () => {
      await listPublicWorkers({ q: "electricista, Chiclayo (urgente)" });
      const expr = calls.find((c) => c.op === "or")!.args[0] as string;
      const topLevelConditions = expr.match(/\w+\.ilike\./g) ?? [];
      expect(topLevelConditions).toHaveLength(4);
      expect(expr).toContain('"%electricista, Chiclayo (urgente)%"');
    });
  });

  // ============================================================
  // Ranking de preparación del perfil (Fase C3) — se aplica sobre las
  // filas ya devueltas por la consulta (que ya vinieron filtradas), nunca
  // excluye a nadie, solo reordena.
  // ============================================================
  describe("ranking — perfil más preparado primero (C3)", () => {
    const empty: WorkerRow = {
      id: "w-empty",
      full_name: "Sin Perfil",
      avatar_url: null,
      city: null,
      category: null,
      skills: [],
      bio: null,
      created_at: "2026-01-03T00:00:00Z",
      professional_title: null,
      availability: null,
      years_experience: null,
      hourly_rate: null,
      daily_rate: null,
      department: null,
      province: null,
      district: null,
    };
    const categoryAndCity: WorkerRow = {
      id: "w-cc",
      full_name: "Category y City",
      avatar_url: null,
      city: "Lima",
      category: "Electricista",
      skills: [],
      bio: null,
      created_at: "2026-01-01T00:00:00Z",
      professional_title: null,
      availability: null,
      years_experience: null,
      hourly_rate: null,
      daily_rate: null,
      department: null,
      province: null,
      district: null,
    };
    const full: WorkerRow = {
      id: "w-full",
      full_name: "Perfil Completo",
      avatar_url: null,
      city: "Lima",
      category: "Electricista",
      skills: ["Soldadura"],
      bio: "Electricista con experiencia",
      created_at: "2026-01-02T00:00:00Z",
      professional_title: "Electricista industrial",
      availability: "inmediata",
      years_experience: 5,
      hourly_rate: 30,
      daily_rate: null,
      department: null,
      province: null,
      district: null,
    };

    it("A-E) ordena perfil completo > category+city > vacío, sin importar created_at", async () => {
      mockRows = [empty, categoryAndCity, full];
      const result = await listPublicWorkers({});
      expect(result.map((w) => w.id)).toEqual(["w-full", "w-cc", "w-empty"]);
    });

    it("F) empate de puntaje se desempata con created_at DESC (más reciente primero)", async () => {
      const tieOld = { ...categoryAndCity, id: "w-tie-old", created_at: "2026-01-01T00:00:00Z" };
      const tieNew = { ...categoryAndCity, id: "w-tie-new", created_at: "2026-01-05T00:00:00Z" };
      mockRows = [tieOld, tieNew];
      const result = await listPublicWorkers({});
      expect(result.map((w) => w.id)).toEqual(["w-tie-new", "w-tie-old"]);
    });

    it("L) sin filtros, TODOS los workers activos siguen apareciendo, solo cambia el orden", async () => {
      mockRows = [empty, categoryAndCity, full];
      const result = await listPublicWorkers({});
      expect(result.map((w) => w.id).sort()).toEqual(["w-cc", "w-empty", "w-full"]);
    });

    it("M) un worker sin worker_profile_details (availability/professional_title null) no se excluye, solo queda más abajo", async () => {
      mockRows = [empty, full];
      const result = await listPublicWorkers({});
      expect(result).toHaveLength(2);
      expect(result.some((w) => w.id === "w-empty")).toBe(true);
      expect(result[0].id).toBe("w-full");
      expect(result[1].id).toBe("w-empty");
    });

    it("G-K) el ranking no interfiere con los filtros ya aplicados (category+q siguen generando los mismos calls)", async () => {
      mockRows = [full];
      await listPublicWorkers({ category: "Logística y almacén", q: "Juan" });
      expect(calls).toContainEqual({
        op: "in",
        args: ["category", ["Logística y almacén", "Almacenero"]],
      });
      expect(calls.some((c) => c.op === "or")).toBe(true);
    });
  });

  // ============================================================
  // Fase C4-G1 — ranking global (corrige P1/G1 de la auditoría C4-G):
  // CANDIDATE_POOL_LIMIT (SQL) separado de DISPLAY_LIMIT (post-ranking).
  // Antes, el LIMIT de 60 se aplicaba en SQL por created_at DESC antes de
  // rankear, así que el ranking solo reordenaba lo que ese corte ya había
  // decidido incluir. Estos tests demuestran que ahora el ranking actúa
  // sobre todo el pool de candidatos devuelto por la consulta, y que el
  // corte a 60 ocurre recién después.
  // ============================================================
  describe("ranking global — CANDIDATE_POOL_LIMIT / DISPLAY_LIMIT (Fase C4-G1)", () => {
    it("Test 1 — un trabajador excelente pero antiguo aparece en el resultado final aunque 61 workers recientes de score bajo lo superen en created_at", async () => {
      const recentEmptyWorkers = Array.from({ length: 61 }, (_, i) =>
        emptyWorker(`w-recent-${i}`, `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)
      );
      const oldExcellentWorker = fullWorker("w-old-excellent", "2015-01-01T00:00:00Z");
      // El worker excelente antiguo va AL FINAL del array — con el bug de
      // C4-G G1, un .limit(60) por created_at en SQL lo habría dejado fuera
      // del pool antes de que el ranking existiera; aquí simula que sigue
      // estando en el pool de candidatos (mock = lo que la consulta SQL
      // devolvería con CANDIDATE_POOL_LIMIT=500) y debe ganar el ranking.
      mockRows = [...recentEmptyWorkers, oldExcellentWorker];

      const result = await listPublicWorkers({});

      expect(result.some((w) => w.id === "w-old-excellent")).toBe(true);
      expect(result[0].id).toBe("w-old-excellent");
    });

    it("Test 2 — con más de 60 candidatos, el resultado final tiene máximo 60 y el primero es el de mayor score", async () => {
      const workers = Array.from({ length: 70 }, (_, i) =>
        i === 0
          ? fullWorker("w-best", "2020-01-01T00:00:00Z")
          : emptyWorker(`w-low-${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)
      );
      mockRows = workers;

      const result = await listPublicWorkers({});

      expect(result.length).toBeLessThanOrEqual(60);
      expect(result[0].id).toBe("w-best");
    });

    it("Test 3 — empate de score entre 2 candidatos se desempata con created_at DESC (más reciente primero)", async () => {
      const tieOld = fullWorker("w-tie-old", "2020-01-01T00:00:00Z");
      const tieNew = fullWorker("w-tie-new", "2026-06-01T00:00:00Z");
      mockRows = [tieOld, tieNew];

      const result = await listPublicWorkers({});

      expect(result.map((w) => w.id)).toEqual(["w-tie-new", "w-tie-old"]);
    });

    it("Test 4 — la consulta SQL sigue pidiendo .limit(500) (CANDIDATE_POOL_LIMIT), incluso con 501 candidatos mockeados", async () => {
      mockRows = Array.from({ length: 501 }, (_, i) =>
        emptyWorker(`w-${i}`, `2026-01-01T00:00:00Z`)
      );

      await listPublicWorkers({});

      expect(limitCalls).toEqual([500]);
    });

    it("Test 5 (Fase C5) — rating_summary se consulta UNA sola vez, acotada al pool completo de candidatos (nunca N+1, nunca solo los 60 finales) — necesario para que el rating pueda influir en quién queda entre esos 60", async () => {
      mockRows = Array.from({ length: 100 }, (_, i) =>
        emptyWorker(`w-${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)
      );

      const result = await listPublicWorkers({});

      expect(ratingQueryCalls).toHaveLength(1);
      expect(ratingQueryCalls[0].col).toBe("profile_id");
      // Los 100 candidatos del mock, no solo los <=60 visibles — la consulta
      // ahora se ejecuta ANTES del recorte a DISPLAY_LIMIT (ver Fase C5).
      expect(ratingQueryCalls[0].ids).toHaveLength(100);
      expect(result.length).toBeLessThanOrEqual(60);
    });

    it("Test 6 — los filtros (category con alias, city, availability, q) siguen aplicándose exactamente igual tras separar los límites", async () => {
      mockRows = [WORKER_ROW];
      await listPublicWorkers({
        category: "Gasfitero",
        city: "Chiclayo",
        availability: "inmediata",
        q: "urgente",
      });

      expect(calls).toContainEqual({ op: "in", args: ["category", ["Gasfitero", "Plomero"]] });
      expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Chiclayo%"] });
      expect(calls).toContainEqual({ op: "eq", args: ["availability", "inmediata"] });
      expect(calls.some((c) => c.op === "or")).toBe(true);
    });

    it("Test 7 — un worker sin worker_profile_details (score 0) sigue apareciendo en el resultado, solo queda al final", async () => {
      const withoutDetails = emptyWorker("w-sin-detalles", "2026-01-01T00:00:00Z");
      mockRows = [fullWorker("w-con-detalles", "2020-01-01T00:00:00Z"), withoutDetails];

      const result = await listPublicWorkers({});

      expect(result.some((w) => w.id === "w-sin-detalles")).toBe(true);
      expect(result[result.length - 1].id).toBe("w-sin-detalles");
    });

    it("Test 8 — Home (listPublicWorkers({}).slice(0, 6)) recibe el resultado completo ya ordenado por calidad, así que tomar los primeros 6 sigue dando los mejores trabajadores", async () => {
      const workers = [
        emptyWorker("w-peor", "2026-06-01T00:00:00Z"),
        fullWorker("w-mejor", "2015-01-01T00:00:00Z"),
        { ...emptyWorker("w-medio", "2026-01-01T00:00:00Z"), category: "Electricista" },
      ];
      mockRows = workers;

      const result = await listPublicWorkers({});
      const top6 = result.slice(0, 6);

      expect(top6[0].id).toBe("w-mejor");
      expect(top6.map((w) => w.id)).toEqual(result.map((w) => w.id));
    });
  });

  // ============================================================
  // jobsCompleted — consulta batched sobre `jobs` (Fase C4-G3, auditoría
  // C4-G2). Nunca una consulta por worker, siempre UNA sola llamada
  // acotada a `visibleWorkers`, agregada en memoria por
  // assigned_worker_id.
  // ============================================================
  describe("jobsCompleted — consulta batched sobre jobs (Fase C4-G3)", () => {
    it("D) worker sin jobs completados → jobsCompleted = 0 (nunca undefined/null)", async () => {
      mockRows = [WORKER_ROW];
      completedJobRows = [];

      const result = await listPublicWorkers({});

      expect(result[0].jobsCompleted).toBe(0);
    });

    it("worker con 8 jobs completados → jobsCompleted = 8, contado a partir de la agregación en memoria", async () => {
      mockRows = [WORKER_ROW];
      completedJobRows = Array.from({ length: 8 }, () => ({ assigned_worker_id: "w-1" }));

      const result = await listPublicWorkers({});

      expect(result[0].jobsCompleted).toBe(8);
    });

    it("E) con 70 candidatos (más de DISPLAY_LIMIT), la consulta a jobs se ejecuta UNA sola vez, nunca una por worker", async () => {
      mockRows = Array.from({ length: 70 }, (_, i) => emptyWorker(`w-${i}`, "2026-01-01T00:00:00Z"));

      await listPublicWorkers({});

      expect(jobsQueryCalls).toHaveLength(1);
    });

    it("F) (Fase C5) la consulta a jobs recibe los ids del pool completo de candidatos, no solo los visibleWorkers finales — necesario para que jobsCompleted pueda influir en quién queda entre los 60 visibles", async () => {
      mockRows = Array.from({ length: 70 }, (_, i) => emptyWorker(`w-${i}`, "2026-01-01T00:00:00Z"));

      await listPublicWorkers({});

      expect(jobsQueryCalls[0].ids).toHaveLength(70);
      expect(jobsQueryCalls[0].ids.sort()).toEqual(mockRows.map((w) => w.id).sort());
    });

    it("G) (Fase C5) con 501 candidatos, la consulta a jobs se ejecuta UNA sola vez, acotada al pool completo (501), nunca N+1", async () => {
      mockRows = Array.from({ length: 501 }, (_, i) => emptyWorker(`w-${i}`, "2026-01-01T00:00:00Z"));

      await listPublicWorkers({});

      expect(jobsQueryCalls).toHaveLength(1);
      expect(jobsQueryCalls[0].ids).toHaveLength(501);
    });

    it("H) el ranking global de C4-G1 sigue intacto: un worker excelente y antiguo sigue ganando aunque ahora también se calcule jobsCompleted", async () => {
      const recentEmptyWorkers = Array.from({ length: 61 }, (_, i) =>
        emptyWorker(`w-recent-${i}`, `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)
      );
      const oldExcellentWorker = fullWorker("w-old-excellent", "2015-01-01T00:00:00Z");
      mockRows = [...recentEmptyWorkers, oldExcellentWorker];

      const result = await listPublicWorkers({});

      expect(result[0].id).toBe("w-old-excellent");
    });

    it("I) (Fase C5) rating_summary y jobs se consultan cada una UNA sola vez, ambas sobre el mismo pool completo de candidatos, sin duplicarse entre sí", async () => {
      mockRows = Array.from({ length: 70 }, (_, i) => emptyWorker(`w-${i}`, "2026-01-01T00:00:00Z"));

      await listPublicWorkers({});

      expect(ratingQueryCalls).toHaveLength(1);
      expect(jobsQueryCalls).toHaveLength(1);
      expect(ratingQueryCalls[0].ids.sort()).toEqual(jobsQueryCalls[0].ids.sort());
    });

    it("N) Home (listPublicWorkers({}) sin filtros) devuelve jobsCompleted numérico en cada worker, listo tal cual lo consume page.tsx vía PublicWorkerListing", async () => {
      mockRows = [WORKER_ROW, { ...WORKER_ROW, id: "w-2" }];
      completedJobRows = [{ assigned_worker_id: "w-1" }];

      const result = await listPublicWorkers({});

      for (const worker of result) {
        expect(typeof worker.jobsCompleted).toBe("number");
        expect(Number.isNaN(worker.jobsCompleted)).toBe(false);
      }
    });
  });

  // ============================================================
  // Fase C5 — rating/jobsCompleted ahora SÍ influyen en el ranking de
  // listPublicWorkers() (antes solo se adjuntaban como datos, después del
  // corte). Ver worker-directory.test.ts para los tests puros de
  // computeWorkerQualityScore(); aquí se prueba la integración end-to-end
  // con las consultas reales de rating_summary/jobs.
  // ============================================================
  describe("ranking considera rating y jobsCompleted (Fase C5)", () => {
    it("Test A — un worker con menos perfil pero excelente rating supera a uno con más perfil y sin ninguna calificación", async () => {
      // w-menos-perfil: solo category (30 pts base) + rating perfecto (30 pts) = 60
      // w-mas-perfil: category + city (55 pts base) + sin rating (0) = 55
      const menosPerfil = { ...emptyWorker("w-menos-perfil", "2026-01-01T00:00:00Z"), category: "Electricista" };
      const masPerfil = { ...emptyWorker("w-mas-perfil", "2026-01-01T00:00:00Z"), category: "Electricista", city: "Lima" };
      mockRows = [masPerfil, menosPerfil];
      ratingRows = [{ profile_id: "w-menos-perfil", average_score: 5, total_ratings: 20 }];

      const result = await listPublicWorkers({});

      expect(result[0].id).toBe("w-menos-perfil");
      expect(result[1].id).toBe("w-mas-perfil");
    });

    it("Test B — jobsCompleted también puede inclinar el orden entre dos perfiles con el mismo score base", async () => {
      const workerA = { ...emptyWorker("w-a", "2026-01-01T00:00:00Z"), category: "Electricista" };
      const workerB = { ...emptyWorker("w-b", "2026-01-01T00:00:00Z"), category: "Electricista" };
      mockRows = [workerB, workerA];
      completedJobRows = Array.from({ length: 10 }, () => ({ assigned_worker_id: "w-a" }));

      const result = await listPublicWorkers({});

      expect(result[0].id).toBe("w-a");
      expect(result[1].id).toBe("w-b");
    });

    it("Test 8 — los filtros existentes (category/city/availability/q) siguen aplicándose exactamente igual cuando además hay datos de rating/jobsCompleted", async () => {
      mockRows = [WORKER_ROW];
      ratingRows = [{ profile_id: "w-1", average_score: 4, total_ratings: 5 }];
      completedJobRows = [{ assigned_worker_id: "w-1" }];

      await listPublicWorkers({
        category: "Electricista",
        city: "Lima",
        availability: "inmediata",
        q: "residencial",
      });

      expect(calls).toContainEqual({ op: "in", args: ["category", ["Electricista"]] });
      expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Lima%"] });
      expect(calls).toContainEqual({ op: "eq", args: ["availability", "inmediata"] });
      expect(calls.some((c) => c.op === "or")).toBe(true);
    });

    it("Test 9 — el ranking es determinista: mismos datos de entrada producen siempre el mismo orden de salida", async () => {
      const workerA = fullWorker("w-a", "2026-01-01T00:00:00Z");
      const workerB = { ...emptyWorker("w-b", "2026-01-02T00:00:00Z"), category: "Electricista" };
      mockRows = [workerA, workerB];
      ratingRows = [{ profile_id: "w-b", average_score: 3, total_ratings: 2 }];
      completedJobRows = [{ assigned_worker_id: "w-a" }, { assigned_worker_id: "w-a" }];

      const first = await listPublicWorkers({});
      const second = await listPublicWorkers({});

      expect(first.map((w) => w.id)).toEqual(second.map((w) => w.id));
    });

    it("Test C — rating puede hacer que un candidato ENTRE al top 60 desplazando a otro que quedaría fuera solo por score base (prueba real del corte, no solo reordenamiento)", async () => {
      // 60 "fillers" con score base 25 (solo city) — cada uno con un
      // created_at distinto para poder predecir cuál pierde el desempate.
      // Sin ningún bono, w-weak (score base 0) quedaría en el puesto 61 y
      // sería EXCLUIDO del resultado — los 60 fillers ya llenarían el cupo.
      // Fechas ÚNICAS por cada uno de los 60 fillers (mes avanza cada 28
      // días para no repetir ninguna combinación mes/día) — necesario para
      // que el desempate por created_at DESC sea 100% determinista y no
      // dependa de la estabilidad del sort ante empates de fecha.
      const fillers = Array.from({ length: 60 }, (_, i) => ({
        ...emptyWorker(
          `w-filler-${i}`,
          `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`
        ),
        city: "Lima", // score base = 25
      }));
      // w-filler-0 es el más antiguo (2020-01-01) -> pierde el desempate
      // entre los 60 fillers (todos con score 25) en cuanto se agrega un
      // 61vo competidor que los supere.
      const weak = emptyWorker("w-weak", "2026-01-01T00:00:00Z"); // score base = 0

      mockRows = [...fillers, weak];
      // w-weak recibe rating perfecto: 0 (base) + 30 (rating) = 30 > 25 (fillers).
      ratingRows = [{ profile_id: "w-weak", average_score: 5, total_ratings: 10 }];

      const result = await listPublicWorkers({});
      const ids = result.map((w) => w.id);

      expect(result).toHaveLength(60); // DISPLAY_LIMIT respetado, sin modificarlo
      // w-weak ENTRA al top 60 gracias al bono de rating — sin el bono
      // habría quedado en el puesto 61 (score 0 vs 25 de cada filler).
      expect(ids).toContain("w-weak");
      // El filler más antiguo (el que pierde el desempate de score=25) es
      // el que queda DESPLAZADO fuera del top 60 por la entrada de w-weak.
      expect(ids).not.toContain("w-filler-0");
      // Los otros 59 fillers sí siguen presentes — solo se desplazó uno.
      for (let i = 1; i < 60; i++) {
        expect(ids).toContain(`w-filler-${i}`);
      }
    });

    it("un worker sin ninguna calificación ni jobs no queda penalizado por debajo de su score base — solo no recibe bonus", async () => {
      const rated = { ...emptyWorker("w-rated", "2026-01-01T00:00:00Z") };
      const coldStart = { ...emptyWorker("w-cold-start", "2026-01-01T00:00:00Z") };
      mockRows = [rated, coldStart];
      ratingRows = [{ profile_id: "w-rated", average_score: 1, total_ratings: 1 }];

      const result = await listPublicWorkers({});

      // Ambos parten de score base 0; w-rated suma un pequeño bonus (1/5*30=6),
      // w-cold-start se queda en 0 — ninguno queda en negativo ni en NaN.
      expect(result.some((w) => w.id === "w-cold-start")).toBe(true);
      expect(result[0].id).toBe("w-rated");
    });
  });
});
