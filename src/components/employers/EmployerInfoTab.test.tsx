import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployerInfoTab } from "./EmployerInfoTab";
import { CITY_NAMES } from "@/lib/cities";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

// updateProfile() es una Server Action — se mockea para poder aserir que
// renderizar EmployerInfoTab (sin disparar un submit real) nunca la
// invoca, ni siquiera con datos históricos de ciudad que requieren
// normalizeCity() (Fase C4-D).
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
};

describe("EmployerInfoTab — catálogo canónico de ciudad (Fase C4-C)", () => {
  it("A) el campo ciudad renderiza como <select>, no como <input> de texto libre", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<select id="employer_city"/);
    expect(html).not.toMatch(/<input id="employer_city"/);
  });

  it("B) las opciones del <select> son exactamente CITY_NAMES", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("C) 'Chiclayo' es una opción seleccionable", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "Chiclayo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("D) el valor existente de profile.city se refleja como seleccionado", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "Trujillo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
  });

  it("E) el <select> conserva name=\"city\" — la misma columna/campo que updateProfile() ya lee", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<select[^>]*id="employer_city"[^>]*name="city"/);
  });

  it("la primera opción es un valor vacío con el texto 'Selecciona tu ciudad'", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={baseProfile}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain('<option value="">Selecciona tu ciudad</option>');
  });
});

describe("EmployerInfoTab — normalizeCity() con datos históricos (Fase C4-D)", () => {
  it("'CHICLAYO' (Production) muestra 'Chiclayo' seleccionado, no el placeholder", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "CHICLAYO" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).not.toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Selecciona tu ciudad<\/option>/);
  });

  it("'Chiclayo' (ya canónico) muestra 'Chiclayo' seleccionado", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "Chiclayo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("'Trujillo' muestra 'Trujillo' seleccionado", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "Trujillo" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
  });

  it("null muestra el placeholder 'Selecciona tu ciudad' seleccionado", () => {
    const html = renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: null }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Selecciona tu ciudad<\/option>/);
  });

  it("renderizar el formulario (sin submit) nunca dispara updateProfile, ni con 'CHICLAYO' que requiere normalización", () => {
    renderToStaticMarkup(
      <EmployerInfoTab
        profile={{ ...baseProfile, city: "CHICLAYO" }}
        rucVerified={false}
        onSaved={() => {}}
        onStatsChange={() => {}}
      />
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
