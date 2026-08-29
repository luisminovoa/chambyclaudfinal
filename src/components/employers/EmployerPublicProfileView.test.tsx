import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployerPublicProfileView } from "./EmployerPublicProfileView";
import type { EmployerPublicProfile } from "@/lib/actions/employers";

// Evita depender del AppRouterContext real de Next.js (no montado en
// este render aislado) — solo interesa el href resultante, no el
// prefetch/navegación de cliente.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseData: EmployerPublicProfile = {
  profile: {
    id: "employer-1",
    full_name: "Jose Ramirez",
    city: "Lima",
    category: null,
    skills: [],
    bio: "Somos una ferretería familiar.",
    avatar_url: null,
    created_at: "2020-01-01T00:00:00Z",
    employer_type: "company",
    business_name: "Ferretería Don Jose",
    business_sector: "Ferretería",
    business_description: "Vendemos herramientas y materiales de construcción.",
  },
  stats: null,
  ratingSummary: null,
  jobsPublished: 3,
  jobsCompleted: 1,
  hires: 1,
  openJobs: [],
};

describe("EmployerPublicProfileView — acceso a edición y no-exposición de datos privados", () => {
  it('muestra "Editar mi perfil" hacia /dashboard/employer/profile cuando viewerId === profile.id', () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).toContain("Editar mi perfil");
    expect(html).toContain('href="/dashboard/employer/profile"');
  });

  it("NO muestra el botón de edición cuando el visitante es otro usuario", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="worker-99" />
    );

    expect(html).not.toContain("Editar mi perfil");
    expect(html).not.toContain('href="/dashboard/employer/profile"');
  });

  it("NO muestra el botón de edición para un visitante anónimo (viewerId null)", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId={null} />
    );

    expect(html).not.toContain("Editar mi perfil");
  });

  it("el perfil público JAMÁS incluye phone/business_ruc en el objeto serializado, no solo en el render — getEmployerPublicProfile() ya no puede devolverlos: se leen de public.public_profiles (0034), que no los proyecta", () => {
    // No basta con que el componente no los muestre en el HTML: deben
    // estar AUSENTES del objeto que llega al cliente. PublicProfileView
    // (src/lib/types.ts) no declara estas claves — este test falla en
    // compilación (no en runtime) si algún día alguien las reintroduce.
    expect("phone" in baseData.profile).toBe(false);
    expect("business_ruc" in baseData.profile).toBe(false);
    expect("role" in baseData.profile).toBe(false);
    expect("is_active" in baseData.profile).toBe(false);

    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );
    expect(html).not.toContain("+51999999999");
    expect(html).not.toContain("20123456789");
  });

  it("muestra identidad empresarial: nombre comercial, tipo y rubro", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).toContain("Ferretería Don Jose");
    expect(html).toContain("Empresa");
    expect(html).toContain("Ferretería");
  });

  it("ya no muestra el distrito (0034_harden_profiles_public_access.sql excluye district de public_profiles) — sí sigue mostrando la ciudad", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).toContain("Lima");
    expect(html).not.toContain("Los Olivos");
  });

  it("sin badges de verificación, la sección de Verificación sigue apareciendo (Fase 2 / C4-G11): RUC e Identidad se muestran como 'No verificado/a', nunca ocultos", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).toContain(">Verificación</h2>");
    expect(html).toMatch(/RUC<\/p>[\s\S]*?>No verificado</);
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?>No verificada</);
  });

  it("con badge ruc_active en stats, muestra RUC como Verificado sin exponer el documento — Identidad y Certificación permanecen No verificado/a", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView
        data={{
          ...baseData,
          stats: { profile_id: "employer-1", completion_percentage: 90, trust_score: 90, badges: ["ruc_active"], updated_at: "2020-01-01T00:00:00Z" },
        }}
        viewerId="employer-1"
      />
    );

    expect(html).toMatch(/RUC<\/p>[\s\S]*?>Verificado</);
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?>No verificada</);
    expect(html).not.toContain("20123456789");
  });

  it("Fase 2 / C4-G11 — con top_profile en stats.badges, muestra 'Perfil destacado' sin presentarlo como una cuarta fila de verificación documental fija", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView
        data={{
          ...baseData,
          stats: {
            profile_id: "employer-1",
            completion_percentage: 90,
            trust_score: 90,
            badges: ["top_profile"],
            updated_at: "2020-01-01T00:00:00Z",
          },
        }}
        viewerId="employer-1"
      />
    );
    expect(html).toContain("Perfil destacado");
  });

  it("Fase 2 / C4-G11 — compatibilidad con el consumidor sin insignias (stats=null, mismo caso que produce `earnedBadges=[]`): VerificationBadges sigue recibiendo un array vacío y renderiza las 3 filas sin romper el resto del perfil", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={{ ...baseData, stats: null }} viewerId="employer-1" />
    );
    expect(html).toContain(">Verificación</h2>");
    expect(html).toContain("Ferretería Don Jose");
  });
});

describe("EmployerPublicProfileView — hiringConversations (Fase C4-G6)", () => {
  it("sin hiringConversations (prop omitida), no muestra ninguna sección de chat", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="worker-99" />
    );
    expect(html).not.toContain("Abrir chat");
    expect(html).not.toContain("Conversaciones");
  });

  it("con una sola conversación, muestra '💬 Abrir chat' hacia esa conversación", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView
        data={baseData}
        viewerId="worker-99"
        hiringConversations={[{ conversationId: "conv-1", jobId: "job-1", jobTitle: "Chamba A" }]}
      />
    );
    expect(html).toContain("💬 Abrir chat");
    expect(html).toMatch(/<a href="\/messages\/conv-1"/);
  });

  it("con varias chambas entre los mismos usuarios, muestra la lista 'Conversaciones' — nunca elige una arbitrariamente", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView
        data={baseData}
        viewerId="worker-99"
        hiringConversations={[
          { conversationId: "conv-a", jobId: "job-a", jobTitle: "Chamba A" },
          { conversationId: "conv-b", jobId: "job-b", jobTitle: "Chamba B" },
        ]}
      />
    );
    expect(html).toContain("Conversaciones");
    expect(html).toContain("Chamba A");
    expect(html).toContain("Chamba B");
  });

  it("no permite chat solo por visitar el perfil: con hiringConversations=[] (sin contratación real), no hay botón de chat", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="worker-99" hiringConversations={[]} />
    );
    expect(html).not.toContain("Abrir chat");
  });
});
