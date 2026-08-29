import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoTab } from "./InfoTab";
import { CATEGORY_NAMES } from "@/lib/categories";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile, WorkerProfileDetails } from "@/lib/types";

// updateProfile()/upsertWorkerProfileDetails() son Server Actions — se
// mockean para poder aserir que renderizar InfoTab (sin disparar un
// submit real) nunca las invoca.
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
  department: null,
  province: null,
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

describe("InfoTab — ubicación jerárquica y aviso de completitud para el directorio (Fase 1)", () => {
  it("A) profile.department/province/district existentes aparecen preseleccionados en LocationSelector", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, department: "Lambayeque", province: "Chiclayo", district: "Pimentel" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Lambayeque"[^>]*selected[^>]*>Lambayeque<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Pimentel"[^>]*selected[^>]*>Pimentel<\/option>/);
  });

  it("B) el selector de departamento no está deshabilitado ni en solo lectura", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    const departmentSelectMatch = html.match(/<select[^>]*name="department"[^>]*>/);
    expect(departmentSelectMatch).not.toBeNull();
    expect(departmentSelectMatch![0]).not.toContain("disabled");
    expect(departmentSelectMatch![0]).not.toContain("readonly");
  });

  it("C) el <select> de departamento ofrece el catálogo completo de Perú, no solo Chiclayo/Trujillo", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    for (const dep of ["Lambayeque", "La Libertad", "Lima", "Cusco", "Puno"]) {
      expect(html).toContain(`>${dep}</option>`);
    }
  });

  it("D) ya no existe ningún <select id=\"city\"> ni <input id=\"district\"> de texto libre", () => {
    const html = renderToStaticMarkup(
      <InfoTab profile={baseProfile} workerDetails={baseWorkerDetails} onStatsChange={() => {}} />
    );
    expect(html).not.toMatch(/<select id="city"/);
    expect(html).not.toMatch(/<input id="district"/);
  });

  it("E) con category y ubicación completos, NO aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: "Electricista", department: "Lima" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).not.toContain("Completa tu ocupación y tu ubicación");
  });

  it("F) con category vacía (ubicación presente), SÍ aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: null, department: "Lima" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain("Completa tu ocupación y tu ubicación");
  });

  it("G) sin departamento (category presente), SÍ aparece el aviso de completitud del directorio", () => {
    const html = renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, category: "Electricista", department: null }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(html).toContain("Completa tu ocupación y tu ubicación");
  });

  it("H) renderizar el formulario (sin submit) nunca dispara updateProfile", () => {
    renderToStaticMarkup(
      <InfoTab
        profile={{ ...baseProfile, department: "Lambayeque", province: "Chiclayo" }}
        workerDetails={baseWorkerDetails}
        onStatsChange={() => {}}
      />
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
