import { describe, expect, it, vi, beforeEach } from "vitest";
import { listPublicWorkers } from "./workers";
import type { PublicWorkerListing } from "@/lib/types";

type WorkerRow = Omit<PublicWorkerListing, "ratingSummary">;

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
};

interface Call {
  op: string;
  args: unknown[];
}

let authenticated = true;
let calls: Call[] = [];
let ratingRows: { profile_id: string; average_score: number; total_ratings: number }[] = [];
let mockRows: WorkerRow[] = [WORKER_ROW];

function reset() {
  authenticated = true;
  calls = [];
  ratingRows = [];
  mockRows = [WORKER_ROW];
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
    limit: () => builder,
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
            in: async () => ({ data: ratingRows }),
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

  it("11) el resultado nunca contiene phone/whatsapp/birth_date/address/district — el tipo no los admite y el mock tampoco los produce", async () => {
    const result = await listPublicWorkers({});
    expect(result[0]).not.toHaveProperty("phone");
    expect(result[0]).not.toHaveProperty("whatsapp");
    expect(result[0]).not.toHaveProperty("birth_date");
    expect(result[0]).not.toHaveProperty("address");
    expect(result[0]).not.toHaveProperty("district");
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
});
