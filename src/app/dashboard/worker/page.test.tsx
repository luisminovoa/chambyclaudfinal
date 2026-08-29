import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkerDashboardPage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import type { Profile, UserRole } from "@/lib/types";

/**
 * Fase 3 / C4-G12 — reporte real de un usuario: "la parte de mi perfil
 * debería ser lo principal y salir primero". La auditoría confirmó que
 * DashboardProfileCard vivía al final de un <aside>, después de
 * Postulaciones/Historial/Reputación, y que — al no existir ningún
 * order-* de Tailwind en el archivo — el orden DOM ya era el orden
 * visual real en mobile y en desktop. Por eso esta suite prueba
 * exclusivamente el ORDEN ESTRUCTURAL del HTML resultante (posición de
 * un string respecto a otro dentro de la misma cadena), nunca clases
 * Tailwind/breakpoints — igual criterio que el resto del repositorio
 * (renderToStaticMarkup, sin jsdom, ver CLAUDE.md).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/profile", () => ({
  getProfileStats: vi.fn().mockResolvedValue({
    profile_id: "worker-1",
    completion_percentage: 60,
    trust_score: 66,
    badges: [],
    updated_at: "2026-01-01T00:00:00Z",
  }),
  getProfilePhotos: vi.fn().mockResolvedValue([]),
  getVerificationDocuments: vi.fn().mockResolvedValue([]),
  getWorkerProfileDetails: vi.fn().mockResolvedValue(null),
  getWorkerExperience: vi.fn().mockResolvedValue([]),
  computeAndSaveProfileStats: vi.fn().mockResolvedValue({ success: true, stats: null }),
}));

// Estado mutable de las tres consultas Supabase crudas que hace la página
// (job_applications, rating_summary, ratings) — reseteado en cada test.
// El builder es "thenable" (implementa `.then`), igual que el
// PostgrestFilterBuilder real de supabase-js: `await supabase.from(x)...`
// funciona sin necesitar un método `.execute()` explícito.
const supabaseState: {
  applications: unknown[];
  ratingSummary: unknown | null;
  recentRatings: unknown[];
} = { applications: [], ratingSummary: null, recentRatings: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      const resultByTable: Record<string, { data: unknown; error: null }> = {
        job_applications: { data: supabaseState.applications, error: null },
        rating_summary: { data: supabaseState.ratingSummary, error: null },
        ratings: { data: supabaseState.recentRatings, error: null },
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => chain,
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve(resultByTable[table] ?? { data: null, error: null }),
      };
      return chain;
    },
  }),
}));

const WORKER_PROFILE: Profile = {
  id: "worker-1",
  role: "worker",
  full_name: "Juana Pérez",
  phone: null,
  city: "Chiclayo",
  category: "Electricista",
  skills: ["Instalaciones"],
  bio: "Electricista con experiencia.",
  avatar_url: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  employer_type: null,
  business_name: null,
  business_sector: null,
  business_description: null,
  business_ruc: null,
  district: null,
  department: null,
  province: null,
};

function mockSession(user: { id: string } | null, profile: Profile | null, userRoles: UserRole[] = ["worker"]) {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({ user, profile, userRoles });
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    title: "Instalación eléctrica",
    city: "Chiclayo",
    category: "Electricista",
    status: "abierto",
    pay_amount: 100,
    pay_type: "fijo",
    ...overrides,
  };
}

describe("WorkerDashboardPage — el perfil aparece primero (Fase 3 / C4-G12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession({ id: "worker-1" }, WORKER_PROFILE);
    supabaseState.applications = [];
    supabaseState.ratingSummary = null;
    supabaseState.recentRatings = [];
  });

  it("A) el Perfil (id=mi-perfil) aparece antes que Postulaciones activas", async () => {
    supabaseState.applications = [
      { id: "app-1", job_id: "job-1", status: "pendiente", created_at: "2026-01-01T00:00:00Z", job: job() },
    ];
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    const profileIdx = html.indexOf('id="mi-perfil"');
    const postulacionesIdx = html.indexOf('id="postulaciones-activas"');
    expect(profileIdx).toBeGreaterThan(-1);
    expect(postulacionesIdx).toBeGreaterThan(-1);
    expect(profileIdx).toBeLessThan(postulacionesIdx);
  });

  it("B) Postulaciones activas aparece antes que Historial laboral", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    const postulacionesIdx = html.indexOf('id="postulaciones-activas"');
    const historialIdx = html.indexOf('id="historial"');
    expect(postulacionesIdx).toBeGreaterThan(-1);
    expect(historialIdx).toBeGreaterThan(-1);
    expect(postulacionesIdx).toBeLessThan(historialIdx);
  });

  it("C) Historial laboral aparece antes que Mi reputación", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    const historialIdx = html.indexOf('id="historial"');
    const reputacionIdx = html.indexOf('id="reputacion"');
    expect(historialIdx).toBeGreaterThan(-1);
    expect(reputacionIdx).toBeGreaterThan(-1);
    expect(historialIdx).toBeLessThan(reputacionIdx);
  });

  it("orden completo de extremo a extremo: Perfil < Postulaciones < Historial < Reputación", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    const order = [
      html.indexOf('id="mi-perfil"'),
      html.indexOf('id="postulaciones-activas"'),
      html.indexOf('id="historial"'),
      html.indexOf('id="reputacion"'),
    ];
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("D) DashboardProfileCard está realmente en el flujo de contenido: su nombre completo y botón 'Editar Perfil' aparecen en el HTML", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("Juana Pérez");
    expect(html).toContain("Editar Perfil");
  });

  it("E) existe un <main> semántico envolviendo Perfil/Postulaciones/Historial/Reputación", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    const mainMatch = html.match(/<main[^>]*>([\s\S]*)<\/main>/);
    expect(mainMatch).not.toBeNull();
    const mainHtml = mainMatch![1];
    expect(mainHtml).toContain('id="mi-perfil"');
    expect(mainHtml).toContain('id="postulaciones-activas"');
    expect(mainHtml).toContain('id="historial"');
    expect(mainHtml).toContain('id="reputacion"');
  });

  it("F) no existe ningún <aside> — el perfil ya no depende de una columna secundaria colocada después de la reputación", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).not.toMatch(/<aside/);
  });

  it("G) el enlace 'Editar Perfil' sigue apuntando a /dashboard/worker/profile", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toMatch(/<a href="\/dashboard\/worker\/profile"[^>]*>[\s\S]*?Editar Perfil/);
  });

  it("regresión: saludo y CTA 'Buscar trabajos' siguen presentes", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("Hola, Juana");
    expect(html).toContain("Buscar trabajos");
    expect(html).toMatch(/<a href="\/jobs"/);
  });

  it("regresión: los 4 StatCard (KPIs) siguen presentes", async () => {
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("Postulaciones activas");
    expect(html).toContain("En mi historial");
    expect(html).toContain("Completados");
    expect(html).toContain("Calificación");
  });

  it("regresión: postulaciones activas se listan cuando existen", async () => {
    supabaseState.applications = [
      {
        id: "app-1",
        job_id: "job-1",
        status: "pendiente",
        created_at: "2026-01-01T00:00:00Z",
        job: job({ title: "Instalación eléctrica" }),
      },
    ];
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("Instalación eléctrica");
  });

  it("regresión: historial laboral se lista cuando existen aplicaciones aceptadas con job en progreso/completado", async () => {
    supabaseState.applications = [
      {
        id: "app-2",
        job_id: "job-2",
        status: "aceptado",
        created_at: "2026-01-01T00:00:00Z",
        job: job({ id: "job-2", title: "Mantenimiento eléctrico", status: "completado" }),
      },
    ];
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("Mantenimiento eléctrico");
  });

  it("regresión: Mi reputación muestra el promedio y el total de reseñas cuando existen", async () => {
    supabaseState.ratingSummary = { profile_id: "worker-1", average_score: 4.5, total_ratings: 3 };
    const html = renderToStaticMarkup(await WorkerDashboardPage());
    expect(html).toContain("4.5 / 5");
    expect(html).toContain("3 reseñas totales");
  });

  it("H) sin sesión, redirige a /login (comportamiento existente sin cambios)", async () => {
    mockSession(null, null, []);
    await expect(WorkerDashboardPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("un employer es redirigido a /dashboard/employer (comportamiento existente sin cambios) — EmployerDashboardPage no se toca ni se ejercita aquí", async () => {
    mockSession({ id: "employer-1" }, { ...WORKER_PROFILE, id: "employer-1", role: "employer" }, ["employer"]);
    await expect(WorkerDashboardPage()).rejects.toThrow("REDIRECT:/dashboard/employer");
  });
});
