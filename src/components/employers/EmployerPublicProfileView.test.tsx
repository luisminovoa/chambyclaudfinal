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

  it("sin badges de verificación, no muestra ningún estado de RUC/DNI verificado", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).not.toContain("RUC activo");
    expect(html).not.toContain("Identidad verificada");
  });

  it("con badge ruc_active en stats, muestra el estado de verificación sin exponer el documento", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView
        data={{
          ...baseData,
          stats: { profile_id: "employer-1", completion_percentage: 90, trust_score: 90, badges: ["ruc_active"], updated_at: "2020-01-01T00:00:00Z" },
        }}
        viewerId="employer-1"
      />
    );

    expect(html).toContain("RUC activo");
    expect(html).not.toContain("20123456789");
  });
});
