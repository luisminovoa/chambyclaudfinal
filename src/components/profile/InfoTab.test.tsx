import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoTab } from "./InfoTab";
import { CATEGORY_NAMES } from "@/lib/categories";
import { CITY_NAMES } from "@/lib/cities";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile, WorkerProfileDetails } from "@/lib/types";

// updateProfile()/upsertWorkerProfileDetails() son Server Actions — se
// mockean para poder aserir que renderizar InfoTab (sin disparar un
// submit real) nunca las invoca, ni siquiera con datos históricos de
// ciudad que requieren normalizeCity() (Fase C4-D).
vi.mock("@/lib/actions/profile", () => ({
  updateProfile: vi.fn(),
  upsertWorkerProfileDetails: vi.fn(),
}));

const baseProfile: Profile = {
  id: "worker-1",
  role: "worker",
  full_name: "Ana Trabajadora",
  phone: null,
  city: "Lima",
  category: "Electricista",
  skills: [],
  bio: null,
  avatar_url: null,
  is_active: true,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  employer_type: null,
  business_name: null,
  business_sector: null,
  business_description: null,
  business_ruc: null,
  district: null,
};

const baseWorkerDetails: WorkerProfileDetails = {
  profile_id: "worker-1",
  professional_title: "Electricista industrial certificado",
  district: null,
  address: null,
  birth_date: null,
  whatsapp: null,
  availability: "inmediata",
  hourly_rate: null,
  daily_rate: null,
  years_experience: 5,
  languages: [],
  work_radius_km: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
};

describe("InfoTab — catálogo canónico de categoría (Fase A)", () => {
  it("2) el <select> de especialidad ofrece exactamente las categorías de categories.ts, sin una segunda lista local", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    for (const name of CATEGORY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("no queda ninguna categoría del catálogo local eliminado (p.ej. 'Plomero', 'Mesero', 'Diseñador')", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    for (const stale of ["Plomero", "Mesero", "Técnico en computadoras", "Diseñador"]) {
      expect(html).not.toContain(`>${stale}</option>`);
    }
  });

  it("4) profile.category sigue reflejándose como el valor seleccionado del <select id=\"category\">", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    // React marca con `selected` la <option> cuya value coincide con el
    // `value` controlado del <select> — prueba que profile.category="Electricista"
    // sigue llegando hasta el <select>, no solo que la lista de opciones cambió.
    expect(html).toMatch(/<option[^>]*value="Electricista"[^>]*selected[^>]*>Electricista<\/option>/);
  });

  it("5) professional_title (worker_profile_details) se muestra de forma independiente de category, sin fusionarse con ella", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: "Gasfitero" }}
        workerDetails={{ ...baseWorkerDetails, professional_title: "Gasfitero con experiencia en instalaciones sanitarias" }}
        onStatsChange={() => {}}
      />
    );
    // Especialidad (category) y Título profesional (professional_title)
    // conviven en el mismo render con valores distintos — si algún cambio
    // futuro los fusionara en un solo campo, uno de estos dos deja de
    // aparecer intacto.
    expect(html).toMatch(/<option[^>]*value="Gasfitero"[^>]*selected[^>]*>Gasfitero<\/option>/);
    expect(html).toContain('value="Gasfitero con experiencia en instalaciones sanitarias"');
  });

  it("category vacía (nunca completada) sigue siendo un valor válido y no bloquea el render", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: null }}
        workerDetails={null}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain('<option value="" selected="">Selecciona una especialidad</option>');
  });
});

describe("InfoTab — ciudad y aviso de completitud para el directorio (Fase B)", () => {
  it("5) profile.city existente aparece como el value seleccionado del <select id=\"city\">", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: "Trujillo" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
  });

  it("6) el campo city es editable: no está deshabilitado ni en solo lectura", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    const citySelectMatch = html.match(/<select id="city"[^>]*>/);
    expect(citySelectMatch).not.toBeNull();
    expect(citySelectMatch![0]).not.toContain("disabled");
    expect(citySelectMatch![0]).not.toContain("readonly");
  });

  it("(C4-C) el <select> de ciudad ofrece exactamente las ciudades de cities.ts", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("(C4-C) la primera opción de ciudad es un valor vacío con el texto 'Selecciona tu ciudad'", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    expect(html).toContain('<option value="">Selecciona tu ciudad</option>');
  });

  it("(C4-C) el <select> de ciudad conserva name=\"city\", igual que el input que reemplaza", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    expect(html).toMatch(/<select[^>]*id="city"[^>]*name="city"/);
  });

  it("10) con category y city completos, NO aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: "Electricista", city: "Lima" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).not.toContain("Completa tu ocupación y tu ciudad");
  });

  it("con category vacía (city presente), SÍ aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: null, city: "Lima" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain("Completa tu ocupación y tu ciudad");
  });

  it("con city vacía (category presente), SÍ aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: "Electricista", city: null }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain("Completa tu ocupación y tu ciudad");
  });
});

describe("InfoTab — normalizeCity() con datos históricos (Fase C4-D)", () => {
  it("A) profile.city = 'CHICLAYO' (Production) muestra 'Chiclayo' seleccionado, no el placeholder", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: "CHICLAYO" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).not.toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Selecciona tu ciudad<\/option>/);
  });

  it("B) profile.city = 'Chiclayo' (ya canónico) muestra 'Chiclayo' seleccionado", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: "Chiclayo" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("C) profile.city = 'Trujillo' muestra 'Trujillo' seleccionado", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: "Trujillo" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
  });

  it("D) profile.city = null muestra el placeholder 'Selecciona tu ciudad' seleccionado", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: null }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Selecciona tu ciudad<\/option>/);
  });

  it("E) renderizar el formulario (sin submit) nunca dispara updateProfile, ni con 'CHICLAYO' que requiere normalización", () => {
    renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, city: "CHICLAYO" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
