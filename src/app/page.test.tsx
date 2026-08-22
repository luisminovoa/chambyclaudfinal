import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { listPublicWorkers } from "@/lib/actions/workers";
import type { Profile, PublicWorkerListing } from "@/lib/types";

// Mismo patrón que RegisterForm.test.tsx/InfoTab.test.tsx: evita depender
// del AppRouterContext real de Next.js en un render aislado.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// HeroSearch (rama worker) usa useRouter() de next/navigation — sin
// AppRouterContext montado, se hace stub mínimo solo para que renderice.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function makeSupabaseBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: unknown }) => void) => resolve({ data: [] }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "jobs" || table === "public_profiles") return makeSupabaseBuilder();
      throw new Error(`tabla inesperada (session client) en el mock de Home: ${table}`);
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "user_roles") return makeSupabaseBuilder();
      throw new Error(`tabla inesperada (admin client) en el mock de Home: ${table}`);
    },
  }),
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/workers", () => ({
  listPublicWorkers: vi.fn(),
}));

const employerProfile = { id: "employer-1", role: "employer" } as Profile;
const workerProfile = { id: "worker-1", role: "worker" } as Profile;

const sampleWorker: PublicWorkerListing = {
  id: "w-1",
  full_name: "Ana Electricista",
  avatar_url: null,
  city: "Lima",
  category: "Electricista",
  skills: [],
  bio: null,
  created_at: "2020-01-01T00:00:00Z",
  professional_title: "Electricista industrial",
  availability: "inmediata",
  years_experience: 5,
  hourly_rate: 30,
  daily_rate: null,
  ratingSummary: null,
};

function mockEmployer() {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
    user: { id: "employer-1" },
    profile: employerProfile,
    userRoles: ["employer"],
  });
}

function mockWorker() {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
    user: { id: "worker-1" },
    profile: workerProfile,
    userRoles: ["worker"],
  });
}

describe("Home — 'Trabajadores recomendados' (employer) vs 'Trabajos recomendados' (worker)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPublicWorkers).mockResolvedValue([sampleWorker]);
  });

  it("A) employer ve 'Trabajadores recomendados' y NUNCA 'Trabajos recomendados'", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Trabajadores recomendados");
    expect(html).not.toContain("Trabajos recomendados");
  });

  it("A) el trabajador recomendado viene de listPublicWorkers() — misma fuente que /workers, sin filtros fijos", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(listPublicWorkers).toHaveBeenCalledWith({});
    expect(html).toContain("Ana Electricista");
  });

  it("A) el CTA de la tarjeta de trabajador apunta al perfil público (/workers/[workerId])", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('href="/workers/w-1"');
  });

  it("'Ver todos' del bloque de employer usa /workers como destino", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    const match = html.match(/<a href="([^"]+)"[^>]*>Ver todos/);
    expect(match?.[1]).toBe("/workers");
  });

  it("B) worker conserva 'Trabajos recomendados' y NUNCA 'Trabajadores recomendados'", async () => {
    mockWorker();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Trabajos recomendados");
    expect(html).not.toContain("Trabajadores recomendados");
  });

  it("B) worker NO dispara listPublicWorkers() — la sección de trabajadores nunca se consulta en su Home", async () => {
    mockWorker();
    await HomePage();
    expect(listPublicWorkers).not.toHaveBeenCalled();
  });

  it("'Ver todos' del bloque de worker sigue usando /jobs como destino", async () => {
    mockWorker();
    const html = renderToStaticMarkup(await HomePage());
    const match = html.match(/<a href="([^"]+)"[^>]*>Ver todos/);
    expect(match?.[1]).toBe("/jobs");
  });

  it("C) Hero employer sigue mostrando 'persona que necesitas' y 'Publicar chamba'", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("persona que necesitas");
    expect(html).toContain("Publicar chamba");
  });

  it("C) Hero worker sigue mostrando 'chambea' y el buscador de trabajos", async () => {
    mockWorker();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("chambea");
    expect(html).toContain("¿Qué chamba buscas?");
  });

  it("C) las categorías de employer siguen enlazando a /workers?category=..., no a /jobs", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("/workers?category=Electricista");
  });

  it("C) las categorías de worker siguen enlazando a /jobs?category=..., sin cambios", async () => {
    mockWorker();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("/jobs?category=Electricista");
  });

  it("C) el catálogo V2 completo (14 categorías) sigue apareciendo en 'Explora por categoría'", async () => {
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    for (const name of [
      "Electricista",
      "Gasfitero",
      "Albañil",
      "Niñera",
      "Cocinero/a",
      "Jardinero",
      "Limpieza",
      "Carpintero",
      "Pintor",
      "Chofer",
      "Seguridad",
      "Administrativo",
      "Logística y almacén",
      "Otro",
    ]) {
      expect(html).toContain(name);
    }
  });

  it("directorio sin resultados (employer) muestra un EmptyState propio, sin romper la página", async () => {
    vi.mocked(listPublicWorkers).mockResolvedValue([]);
    mockEmployer();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("La hormiguita todavía no encontró trabajadores");
  });
});
