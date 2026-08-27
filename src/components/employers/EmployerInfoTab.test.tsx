import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployerInfoTab } from "./EmployerInfoTab";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

// updateProfile() es una Server Action — se mockea para poder aserir que
// renderizar EmployerInfoTab (sin disparar un submit real) nunca la invoca.
vi.mock("@/lib/actions/profile", () => ({
  updateProfile: vi.fn(),
}));

const baseProfile: Profile = {
  id: "employer-1",
  role: "employer",
  full_name: "Constructora Andina SAC",
  phone: null,
  city: "Trujillo",
  category: null,
  skills: [],
  bio: null,
  avatar_url: null,
  is_active: true,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  employer_type: "company",
  business_name: null,
  business_sector: null,
  business_description: null,
  business_ruc: null,
  district: null,
  department: null,
  province: null,
};

describe("EmployerInfoTab — ubicación jerárquica (Fase 1)", () => {
  it("A) el campo de ubicación renderiza como LocationSelector (tres <select>), no como el <select> de ciudad limitado", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).not.toMatch(/<select id="employer_city"/);
    expect(html).not.toMatch(/<input id="employer_district"/);
    // 3 <select> de LocationSelector + 1 de "Tipo de empleador".
    expect((html.match(/<select/g) ?? []).length).toBe(4);
  });

  it("B) el departamento ofrece el catálogo completo de Perú, no solo Chiclayo/Trujillo", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    for (const dep of ["Lambayeque", "La Libertad", "Lima", "Cusco", "Puno"]) {
      expect(html).toContain(`>${dep}</option>`);
    }
  });

  it("C) profile.department/province/district existentes aparecen preseleccionados", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, department: "La Libertad", province: "Trujillo", district: "Trujillo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="La Libertad"[^>]*selected[^>]*>La Libertad<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
  });

  it("D) sin ubicación previa, los tres <select> parten vacíos (provincia/distrito deshabilitados)", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: null, department: null, province: null, district: null }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain("disabled=\"\"");
  });

  it("E) renderizar el formulario (sin submit) nunca dispara updateProfile", () => {
    renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, department: "Lambayeque", province: "Chiclayo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
