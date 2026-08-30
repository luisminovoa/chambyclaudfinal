import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import EmployerProfilePage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getEmployerPublicProfile } from "@/lib/actions/employers";
import { getHiringConversations } from "@/lib/actions/chat";
import type { EmployerPublicProfile } from "@/lib/actions/employers";
import type { HiringConversation } from "@/lib/actions/chat";

/**
 * Fase 7 (C4-G20, Reporte B) — el usuario reportó, con una segunda
 * captura real, que el mismo problema de orden (conversaciones antes que
 * perfil) también ocurriría en el perfil público del empleador. La
 * auditoría de esta fase leyó `src/app/employers/[id]/page.tsx` (el path
 * real es `[id]`, no `[employerId]` como asumía el pedido) y
 * `EmployerPublicProfileView.tsx` completos:
 *
 * A diferencia de `/workers/[workerId]`, el employer NO tiene un
 * componente hermano tipo "EmployerProfileActions" separado del perfil —
 * todo (encabezado con nombre/avatar/rating/editar-o-reportar,
 * conversaciones, confianza, descripción, trabajos abiertos) vive dentro
 * de UN SOLO componente, `EmployerPublicProfileView`, y dentro de ese
 * componente el encabezado (que contiene el <h1> del perfil) YA aparece
 * antes que el bloque de conversaciones (`hiringConversations.length > 0`,
 * línea ~138 de ese archivo) — en ese mismo orden, sin condición por
 * viewport. Es decir: el código real YA cumple "Perfil → Conversaciones"
 * para el empleador; no hay ningún swap de JSX que hacer aquí, ni en
 * `page.tsx` (que solo renderiza un componente, no dos hermanos) ni
 * dentro de `EmployerPublicProfileView.tsx`.
 *
 * Por eso esta fase NO modifica ningún archivo de employer — solo agrega
 * la cobertura de test que antes no existía, para demostrar y proteger
 * ese orden correcto contra una futura regresión (p. ej. alguien movería
 * el bloque de conversaciones antes del encabezado sin darse cuenta).
 * Mismo patrón de mocks que src/app/workers/[workerId]/page.test.tsx.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/employers", () => ({
  getEmployerPublicProfile: vi.fn(),
}));

vi.mock("@/lib/actions/chat", () => ({
  getHiringConversations: vi.fn(),
}));

const RICH_EMPLOYER: EmployerPublicProfile = {
  profile: {
    id: "employer-1",
    full_name: "Jose Ramirez",
    avatar_url: null,
    city: "Lima",
    category: null,
    skills: [],
    bio: "Somos una ferretería familiar.",
    created_at: "2020-01-01T00:00:00Z",
    employer_type: "company",
    business_name: "Ferretería Don Jose",
    business_sector: "Ferretería",
    business_description: "Vendemos herramientas y materiales de construcción.",
  },
  stats: {
    profile_id: "employer-1",
    completion_percentage: 80,
    trust_score: 70,
    badges: ["identity_verified"],
    updated_at: "2020-01-01T00:00:00Z",
  },
  ratingSummary: { profile_id: "employer-1", average_score: 4.5, total_ratings: 8 },
  jobsPublished: 3,
  jobsCompleted: 2,
  hires: 2,
  openJobs: [
    { id: "job-1", title: "Ayudante de ferretería", city: "Lima", pay_amount: 60, pay_type: "por_dia" },
  ],
};

async function renderPage(viewerId: string | null = "worker-1") {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
    user: viewerId ? { id: viewerId } : null,
    profile: viewerId ? { id: viewerId, role: "worker" } : null,
    userRoles: viewerId ? ["worker"] : [],
  } as never);

  const jsx = await EmployerProfilePage({ params: { id: "employer-1" } });
  return renderToStaticMarkup(jsx);
}

describe("/employers/[id] — perfil antes de conversaciones (Fase 7 / C4-G20)", () => {
  beforeEach(() => {
    vi.mocked(getEmployerPublicProfile).mockResolvedValue(RICH_EMPLOYER);
    vi.mocked(getHiringConversations).mockResolvedValue([]);
  });

  it("A) sin conversaciones existentes, el <h1> del perfil está presente y no hay bloque de conversaciones que preceda nada", async () => {
    const html = await renderPage();
    expect(html.indexOf("<h1")).toBeGreaterThan(-1);
    expect(html).not.toContain("💬 Abrir chat");
  });

  it("B) con UNA conversación existente, el perfil (<h1>) aparece ANTES que '💬 Abrir chat'", async () => {
    vi.mocked(getHiringConversations).mockResolvedValue([
      { conversationId: "conv-1", jobId: "job-1", jobTitle: "Chamba A" },
    ] as HiringConversation[]);

    const html = await renderPage();

    const profileIndex = html.indexOf("<h1");
    const chatIndex = html.indexOf("💬 Abrir chat");
    expect(profileIndex).toBeGreaterThan(-1);
    expect(chatIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeLessThan(chatIndex);
  });

  it("C) con VARIAS conversaciones existentes, el perfil (<h1>) aparece ANTES que el heading 'Conversaciones'", async () => {
    vi.mocked(getHiringConversations).mockResolvedValue([
      { conversationId: "conv-a", jobId: "job-a", jobTitle: "Chamba A" },
      { conversationId: "conv-b", jobId: "job-b", jobTitle: "Chamba B" },
    ]);

    const html = await renderPage();

    const profileIndex = html.indexOf("<h1");
    const conversationsIndex = html.indexOf("Conversaciones");
    expect(profileIndex).toBeGreaterThan(-1);
    expect(conversationsIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeLessThan(conversationsIndex);
    expect(html).toContain("Chamba A");
    expect(html).toContain("Chamba B");
  });

  it("D) el perfil también precede a la sección de confianza/descripción/trabajos disponibles (orden completo de la página)", async () => {
    const html = await renderPage();

    const profileIndex = html.indexOf("<h1");
    const trustIndex = html.indexOf("Puntuación de confianza");
    const descriptionIndex = html.indexOf("Sobre esta empresa");
    const openJobsIndex = html.indexOf("Trabajos disponibles");

    expect(profileIndex).toBeLessThan(trustIndex);
    expect(profileIndex).toBeLessThan(descriptionIndex);
    expect(profileIndex).toBeLessThan(openJobsIndex);
  });
});

describe("/employers/[id] — regresión: ningún bloque desaparece (Fase 7)", () => {
  beforeEach(() => {
    vi.mocked(getEmployerPublicProfile).mockResolvedValue(RICH_EMPLOYER);
    vi.mocked(getHiringConversations).mockResolvedValue([]);
  });

  it("E) el perfil completo sigue presente: nombre comercial, tipo, rubro, ciudad, rating, badges de trabajos/contrataciones", async () => {
    const html = await renderPage();

    expect(html).toContain("Ferretería Don Jose");
    expect(html).toContain("Empresa");
    expect(html).toContain("Ferretería");
    expect(html).toContain("Lima");
    expect(html).toContain("4.5");
    expect(html).toContain("3 trabajos publicados");
    expect(html).toContain("2 trabajos completados");
    expect(html).toContain("2 contrataciones");
  });

  it("F) 'Reportar' sigue presente para un visitante que no es el dueño del perfil", async () => {
    const html = await renderPage("worker-1");
    expect(html).toMatch(/aria-label="Reportar"/);
    expect(html).not.toContain("Editar mi perfil");
  });

  it("G) 'Editar mi perfil' sigue presente cuando el viewer es el propio empleador (en vez de Reportar)", async () => {
    const html = await renderPage("employer-1");
    expect(html).toContain("Editar mi perfil");
    expect(html).not.toMatch(/aria-label="Reportar"/);
  });

  it("H) con una conversación existente, '💬 Abrir chat' sigue enlazando a /messages/[conversationId]", async () => {
    vi.mocked(getHiringConversations).mockResolvedValue([
      { conversationId: "conv-1", jobId: "job-1", jobTitle: "Chamba A" },
    ]);
    const html = await renderPage();
    expect(html).toMatch(/<a href="\/messages\/conv-1"[^>]*>[\s\S]*?💬 Abrir chat/);
  });

  it("I) 'Trabajos disponibles' sigue listando los openJobs sin cambios", async () => {
    const html = await renderPage();
    expect(html).toContain("Trabajos disponibles");
    expect(html).toContain("Ayudante de ferretería");
  });

  it("J) EmptyState (perfil no encontrado) sigue funcionando cuando getEmployerPublicProfile devuelve null", async () => {
    vi.mocked(getEmployerPublicProfile).mockResolvedValue(null);
    const html = await renderPage();
    expect(html).toContain("No podemos mostrar este perfil");
    expect(html).not.toContain("<h1");
  });
});

describe("/employers/[id] — sin CSS de reordenamiento (Fase 7)", () => {
  it("K) ni la página ni el componente de perfil usan order-*, grid para reordenar, ni renderizado condicional por viewport", () => {
    const pageSource = readFileSync(path.resolve(__dirname, "page.tsx"), "utf-8");
    const viewSource = readFileSync(
      path.resolve(__dirname, "../../../components/employers/EmployerPublicProfileView.tsx"),
      "utf-8"
    );
    for (const source of [pageSource, viewSource]) {
      expect(source).not.toMatch(/\border-(first|last|none|\d+)\b/);
      expect(source).not.toMatch(/flex-col-reverse|flex-row-reverse/);
    }
  });

  it("L) el encabezado del perfil (con el <h1>) precede al bloque de conversaciones en el propio código fuente del componente", () => {
    const viewSource = readFileSync(
      path.resolve(__dirname, "../../../components/employers/EmployerPublicProfileView.tsx"),
      "utf-8"
    );
    const headerIndex = viewSource.indexOf("{/* Encabezado */}");
    const conversationsIndex = viewSource.indexOf("hiringConversations.length > 0");
    expect(headerIndex).toBeGreaterThan(-1);
    expect(conversationsIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeLessThan(conversationsIndex);
  });
});
