import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobsPage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

/**
 * Fase 6 (C4-G18) — /jobs debe seguir aplicando `city` (ilike, legacy) y
 * agregar department/province/district (.eq() exacto, opcionales) sin
 * tocar los filtros existentes (category, q). No existía ningún test
 * para este Server Component antes de esta fase — primera cobertura,
 * mismo patrón de mock que src/app/page.test.tsx (Home).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/jobs",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

interface Call {
  op: string;
  args: unknown[];
}

let calls: Call[] = [];
let mockJobRows: Record<string, unknown>[] = [];

const JOB_ROW = {
  id: "job-1",
  employer_id: "employer-1",
  title: "Electricista para instalación",
  description: "Se busca electricista con experiencia.",
  category: "Electricista",
  city: "Chiclayo",
  department: null,
  province: null,
  district: null,
  address: null,
  pay_amount: 100,
  pay_type: "por_dia",
  status: "abierto",
  positions_needed: 1,
  assigned_worker_id: null,
  starts_at: null,
  hired_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function makeJobsBuilder() {
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
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: mockJobRows, error: null }),
  };
  return builder;
}

function makeProfilesBuilder() {
  return {
    select: () => ({
      in: async () => ({
        data: [{ id: "employer-1", full_name: "Jose Ramirez", avatar_url: null, city: "Chiclayo" }],
      }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "jobs") return makeJobsBuilder();
      if (table === "public_profiles") return makeProfilesBuilder();
      throw new Error(`tabla inesperada en el mock de /jobs: ${table}`);
    },
  }),
}));

describe("/jobs — filtros de ubicación jerárquica (Fase 6 / C4-G18)", () => {
  beforeEach(() => {
    calls = [];
    mockJobRows = [JOB_ROW];
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: null,
      profile: null,
      userRoles: [],
    });
  });

  it("sin filtros, no aplica ningún eq/ilike/or geográfico adicional (solo el eq('status', 'abierto') siempre presente)", async () => {
    const html = renderToStaticMarkup(await JobsPage({ searchParams: {} }));
    expect(calls).toEqual([{ op: "eq", args: ["status", "abierto"] }]);
    expect(html).toContain("Electricista para instalación");
  });

  it("department aplica exactamente un eq('department', valor)", async () => {
    await JobsPage({ searchParams: { department: "Lambayeque" } });
    expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
  });

  it("province aplica exactamente un eq('province', valor)", async () => {
    await JobsPage({ searchParams: { province: "Chiclayo" } });
    expect(calls).toContainEqual({ op: "eq", args: ["province", "Chiclayo"] });
  });

  it("district aplica exactamente un eq('district', valor)", async () => {
    await JobsPage({ searchParams: { district: "Cayaltí" } });
    expect(calls).toContainEqual({ op: "eq", args: ["district", "Cayaltí"] });
  });

  it("combina department + province + district + city + category + q sin interferir entre sí", async () => {
    await JobsPage({
      searchParams: {
        department: "Lambayeque",
        province: "Chiclayo",
        district: "Cayaltí",
        city: "Chiclayo",
        category: "Electricista",
        q: "urgente",
      },
    });
    expect(calls).toContainEqual({ op: "eq", args: ["department", "Lambayeque"] });
    expect(calls).toContainEqual({ op: "eq", args: ["province", "Chiclayo"] });
    expect(calls).toContainEqual({ op: "eq", args: ["district", "Cayaltí"] });
    expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Chiclayo%"] });
    expect(calls).toContainEqual({ op: "eq", args: ["category", "Electricista"] });
    expect(calls.some((c) => c.op === "or")).toBe(true);
  });

  it("city (legacy) sigue aplicando ilike exacto, sin ningún cambio de comportamiento", async () => {
    await JobsPage({ searchParams: { city: "Trujillo" } });
    expect(calls).toContainEqual({ op: "ilike", args: ["city", "%Trujillo%"] });
  });
});
