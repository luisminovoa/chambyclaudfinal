import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import WorkerProfilePage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getWorkerPublicProfile } from "@/lib/actions/workers";
import { getHiringConversations } from "@/lib/actions/chat";
import type { WorkerPublicProfile } from "@/lib/actions/workers";
import type { HiringConversation } from "@/lib/actions/chat";

/**
 * Fase 7 (C4-G20, Reporte B) — /workers/[workerId] no tenía ningún test
 * propio antes de esta fase (confirmado en la auditoría C4-G20): solo
 * existían tests de sus dos componentes hijos por separado
 * (WorkerPublicProfileView.test.tsx, WorkerProfileActions.test.tsx). Este
 * archivo cubre exclusivamente lo que cambió: el ORDEN en que ambos
 * bloques aparecen en el HTML final — perfil primero, conversaciones/
 * acciones después — sin reimplementar la cobertura ya existente de cada
 * componente por su cuenta.
 *
 * Mismo patrón de mocks que src/app/page.test.tsx (Home) y
 * WorkerProfileActions.test.tsx: renderToStaticMarkup sin AppRouterContext
 * real, con next/link y next/navigation stubbeados al mínimo.
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
  redirect: vi.fn(),
}));

vi.mock("@/lib/actions/jobs", () => ({
  // updateApplicationStatus() es una Server Action importada por
  // WorkerProfileActions.tsx — nunca se invoca en un render estático
  // (ningún click real ocurre), solo necesita una referencia válida.
  updateApplicationStatus: vi.fn(),
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/workers", () => ({
  getWorkerPublicProfile: vi.fn(),
}));

vi.mock("@/lib/actions/chat", () => ({
  getHiringConversations: vi.fn(),
}));

const RICH_PROFILE: WorkerPublicProfile = {
  profile: {
    id: "worker-1",
    full_name: "Juana Pérez",
    avatar_url: null,
    city: "Chiclayo",
    category: "Electricista",
    skills: ["Instalaciones eléctricas", "Mantenimiento"],
    bio: "Electricista con 5 años de experiencia en instalaciones residenciales.",
    created_at: "2020-01-01T00:00:00Z",
    department: null,
    province: null,
    district: null,
  },
  workerDetails: {
    professional_title: "Electricista industrial",
    availability: "inmediata",
    years_experience: 5,
    hourly_rate: 30,
    daily_rate: null,
    languages: ["Español", "Quechua"],
  },
  photos: [
    {
      id: "photo-1",
      profile_id: "worker-1",
      storage_path: "worker-1/1.jpg",
      public_url: "https://example.com/1.jpg",
      is_primary: true,
      display_order: 0,
      created_at: "2020-01-01T00:00:00Z",
    },
    {
      id: "photo-2",
      profile_id: "worker-1",
      storage_path: "worker-1/2.jpg",
      public_url: "https://example.com/2.jpg",
      is_primary: false,
      display_order: 1,
      created_at: "2020-01-01T00:00:00Z",
    },
  ],
  experience: [
    {
      id: "exp-1",
      profile_id: "worker-1",
      company: "Ferretería Don Jose",
      job_title: "Electricista de mantenimiento",
      start_date: "2019-01-01",
      end_date: null,
      is_current: true,
      description: "Instalaciones y mantenimiento eléctrico.",
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    },
  ],
  stats: {
    profile_id: "worker-1",
    completion_percentage: 90,
    trust_score: 80,
    badges: ["identity_verified", "top_profile"],
    updated_at: "2020-01-01T00:00:00Z",
  },
  ratingSummary: { profile_id: "worker-1", average_score: 4.8, total_ratings: 12 },
  jobsCompleted: 3,
  application: null,
  jobId: null,
  conversationId: null,
  viewerIsEmployer: false,
};

function reactRoot(page: React.ReactElement) {
  return renderToStaticMarkup(page);
}

async function renderPage(searchParams: { job?: string } = {}) {
  const jsx = await WorkerProfilePage({ params: { workerId: "worker-1" }, searchParams });
  return reactRoot(jsx);
}

describe("/workers/[workerId] — orden perfil antes de conversaciones (Fase 7 / C4-G20)", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "employer-1" },
      profile: { id: "employer-1", role: "employer" },
      userRoles: ["employer"],
    } as never);
  });

  it("A) el perfil (h1 con el nombre) aparece ANTES que el bloque de conversaciones/acciones en el HTML — sin jobId, con conversaciones existentes", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue(RICH_PROFILE);
    vi.mocked(getHiringConversations).mockResolvedValue([
      { conversationId: "conv-1", jobId: "job-1", jobTitle: "Chamba A" },
    ] as HiringConversation[]);

    const html = await renderPage();

    const profileIndex = html.indexOf("<h1");
    const actionsIndex = html.indexOf("Guardar trabajador");
    expect(profileIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeLessThan(actionsIndex);
  });

  it("B) mismo orden (perfil antes) cuando SÍ hay jobId y conversationId (flujo desde /jobs/[id] → Ver perfil)", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue({
      ...RICH_PROFILE,
      jobId: "job-1",
      conversationId: "conv-1",
      application: { id: "app-1", status: "aceptado" },
      viewerIsEmployer: true,
    });
    vi.mocked(getHiringConversations).mockResolvedValue([]);

    const html = await renderPage({ job: "job-1" });

    const profileIndex = html.indexOf("<h1");
    const chatIndex = html.indexOf("💬 Abrir chat");
    expect(profileIndex).toBeGreaterThan(-1);
    expect(chatIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeLessThan(chatIndex);
  });

  it("C) mismo orden cuando Aceptar/Rechazar están visibles (canManage + postulación pendiente)", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue({
      ...RICH_PROFILE,
      jobId: "job-1",
      application: { id: "app-1", status: "pendiente" },
      viewerIsEmployer: true,
    });
    vi.mocked(getHiringConversations).mockResolvedValue([]);

    const html = await renderPage({ job: "job-1" });

    const profileIndex = html.indexOf("<h1");
    const acceptIndex = html.indexOf("Aceptar");
    expect(html).toContain("Rechazar");
    expect(profileIndex).toBeLessThan(acceptIndex);
  });
});

describe("/workers/[workerId] — regresión: ningún bloque desaparece tras el reordenamiento (Fase 7)", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "employer-1" },
      profile: { id: "employer-1", role: "employer" },
      userRoles: ["employer"],
    } as never);
    vi.mocked(getWorkerPublicProfile).mockResolvedValue(RICH_PROFILE);
    vi.mocked(getHiringConversations).mockResolvedValue([]);
  });

  it("D) el perfil completo sigue presente: nombre, ciudad, rating, categoría, bio, tarifa, galería, skills, idiomas, experiencia", async () => {
    const html = await renderPage();

    expect(html).toContain("Juana Pérez");
    expect(html).toContain("Chiclayo");
    expect(html).toContain("4.8");
    expect(html).toContain("Electricista");
    expect(html).toContain("Electricista con 5 años de experiencia");
    expect(html).toContain("30");
    expect(html).toContain("Instalaciones eléctricas");
    expect(html).toContain("Quechua");
    expect(html).toContain("Electricista de mantenimiento");
    // Galería: la foto secundaria (no primaria) se renderiza como <img>.
    expect(html).toContain("https://example.com/2.jpg");
  });

  it("E) el bloque de acciones/conversaciones sigue presente: Guardar trabajador, Reportar", async () => {
    const html = await renderPage();

    expect(html).toContain("Guardar trabajador");
    // ReportButton (variant="icon") — el aria-label real del trigger.
    expect(html).toMatch(/aria-label="Reportar"|Reportar/);
  });

  it("F) con jobId y conversationId, 'Volver a la publicación' y '💬 Abrir chat' siguen presentes", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue({
      ...RICH_PROFILE,
      jobId: "job-1",
      conversationId: "conv-1",
    });

    const html = await renderPage({ job: "job-1" });

    expect(html).toContain("Volver a la publicación");
    expect(html).toContain("💬 Abrir chat");
  });

  it("G) sin jobId, con varias conversaciones existentes, se muestra el listado 'Conversaciones' (HiringConversations)", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue(RICH_PROFILE);
    vi.mocked(getHiringConversations).mockResolvedValue([
      { conversationId: "conv-a", jobId: "job-a", jobTitle: "Chamba A" },
      { conversationId: "conv-b", jobId: "job-b", jobTitle: "Chamba B" },
    ]);

    const html = await renderPage();

    expect(html).toContain("Conversaciones");
    expect(html).toContain("Chamba A");
    expect(html).toContain("Chamba B");
  });

  it("H) EmptyState (perfil no disponible) sigue funcionando sin cambios cuando getWorkerPublicProfile devuelve null", async () => {
    vi.mocked(getWorkerPublicProfile).mockResolvedValue(null);
    vi.mocked(getHiringConversations).mockResolvedValue([]);

    const html = await renderPage();

    expect(html).toContain("No podemos mostrar este perfil");
    expect(html).not.toContain("Guardar trabajador");
  });
});

describe("/workers/[workerId] — el reordenamiento es JSX puro, sin CSS de posicionamiento (Fase 7)", () => {
  it("I) el código fuente de la página no introduce order-*, grid ni reordenamiento condicional por viewport", () => {
    const source = readFileSync(
      path.resolve(__dirname, "page.tsx"),
      "utf-8"
    );
    expect(source).not.toMatch(/\border-(first|last|none|\d+)\b/);
    expect(source).not.toMatch(/\bgrid\b/);
    expect(source).not.toMatch(/flex-col-reverse|flex-row-reverse/);
    // Sigue siendo el mismo stack vertical de siempre.
    expect(source).toContain('className="space-y-6"');
  });

  it("J) el orden real en el JSX es WorkerPublicProfileView antes que WorkerProfileActions", () => {
    const source = readFileSync(
      path.resolve(__dirname, "page.tsx"),
      "utf-8"
    );
    const profileViewIndex = source.indexOf("<WorkerPublicProfileView");
    const actionsIndex = source.indexOf("<WorkerProfileActions");
    expect(profileViewIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(profileViewIndex).toBeLessThan(actionsIndex);
  });
});
