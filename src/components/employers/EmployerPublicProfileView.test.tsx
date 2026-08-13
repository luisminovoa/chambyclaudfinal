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
    role: "employer",
    full_name: "Ferretería Don Jose",
    phone: "+51999999999",
    city: "Lima",
    category: null,
    skills: [],
    bio: "Somos una ferretería familiar.",
    avatar_url: null,
    is_active: true,
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
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

  it("el perfil público NUNCA renderiza el teléfono del empleador", () => {
    const html = renderToStaticMarkup(
      <EmployerPublicProfileView data={baseData} viewerId="employer-1" />
    );

    expect(html).not.toContain("+51999999999");
  });
});
