import { describe, expect, it, vi, beforeEach } from "vitest";
import { listPublicWorkers } from "./workers";

const WORKER_ROW = {
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

function reset() {
  authenticated = true;
  calls = [];
  ratingRows = [];
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
    then: (resolve: (v: { data: unknown }) => void) => resolve({ data: [WORKER_ROW] }),
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

  it("sin filtros, no aplica ningún eq/ilike/or", async () => {
    await listPublicWorkers({});
    expect(calls).toEqual([]);
  });

  it("5) category aplica exactamente un eq('category', valor)", async () => {
    await listPublicWorkers({ category: "Electricista" });
    expect(calls).toContainEqual({ op: "eq", args: ["category", "Electricista"] });
  });

  it("6) city aplica exactamente un ilike('city', %valor%)", async () => {
    await listPublicWorkers({ city: "Chiclayo" });
    expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Chiclayo%"] });
  });

  it("availability aplica exactamente un eq('availability', valor)", async () => {
    await listPublicWorkers({ availability: "una_semana" });
    expect(calls).toContainEqual({ op: "eq", args: ["availability", "una_semana"] });
  });

  it("7) q aplica un or() que cubre full_name/professional_title/category/city", async () => {
    await listPublicWorkers({ q: "electricista" });
    const orCall = calls.find((c) => c.op === "or");
    expect(orCall).toBeDefined();
    const expr = orCall!.args[0] as string;
    expect(expr).toContain("full_name.ilike.%electricista%");
    expect(expr).toContain("professional_title.ilike.%electricista%");
    expect(expr).toContain("category.ilike.%electricista%");
    expect(expr).toContain("city.ilike.%electricista%");
  });

  it("combina category + city + availability + q en una sola llamada", async () => {
    await listPublicWorkers({
      category: "Electricista",
      city: "Lima",
      availability: "inmediata",
      q: "residencial",
    });
    expect(calls).toContainEqual({ op: "eq", args: ["category", "Electricista"] });
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
});
