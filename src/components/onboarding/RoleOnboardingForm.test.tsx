import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleOnboardingForm } from "./RoleOnboardingForm";
import { CITY_NAMES } from "@/lib/cities";

// completeGoogleOnboarding() es una Server Action — no se invoca en este
// test (solo se renderiza el formulario, nunca se dispara un submit
// real), pero useFormState() necesita una referencia de función válida.
vi.mock("@/lib/actions/roles", () => ({
  completeGoogleOnboarding: vi.fn(),
}));

// Mismo patrón que RegisterForm.test.tsx: el `react-dom` de npm no expone
// useFormState/useFormStatus en este entorno de test.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: (_action: unknown, initialState: unknown) => [initialState, ""],
    useFormStatus: () => ({ pending: false }),
  };
});

describe("RoleOnboardingForm — catálogo canónico de ciudad (Fase C4-F)", () => {
  it("A) el <select> de ciudad ofrece 'Selecciona tu ciudad', Chiclayo y Trujillo", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain('<option value="" selected="">Selecciona tu ciudad</option>');
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("B) el campo ciudad sigue siendo opcional: la etiqueta indica '(opcional)' y el <select> no es required", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain("(opcional)");
    const selectMatch = html.match(/<select id="city"[^>]*>/);
    expect(selectMatch).not.toBeNull();
    expect(selectMatch![0]).not.toContain("required");
  });

  it("C) initialCity='Chiclayo' (ya canónico) queda seleccionado", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm initialCity="Chiclayo" />);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("D) initialCity='CHICLAYO' (variante histórica) normaliza visualmente a 'Chiclayo' seleccionado", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm initialCity="CHICLAYO" />);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("E) initialCity='trujillo'/'TRUJILLO' normaliza a 'Trujillo' seleccionado", () => {
    for (const raw of ["trujillo", "TRUJILLO"]) {
      const html = renderToStaticMarkup(<RoleOnboardingForm initialCity={raw} />);
      expect(html).toMatch(/<option[^>]*value="Trujillo"[^>]*selected[^>]*>Trujillo<\/option>/);
    }
  });

  it("F) un valor histórico fuera del catálogo (p. ej. 'Lima') no se transforma en Chiclayo ni en Trujillo", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm initialCity="Lima" />);
    expect(html).not.toMatch(/<option[^>]*value="Chiclayo"[^>]*selected/);
    expect(html).not.toMatch(/<option[^>]*value="Trujillo"[^>]*selected/);
  });

  it("H) sin initialCity (caso normal: primer login con Google) el placeholder queda seleccionado", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Selecciona tu ciudad<\/option>/);
  });

  it("I) jobs.city no interviene en este formulario: no hay ningún campo ni referencia a 'jobs'", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toContain("jobs");
  });

  it("J) el resto del onboarding (intent worker/employer/both) no se alteró", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain("Buscar trabajo");
    expect(html).toContain("Contratar personas");
    expect(html).toContain("Ambos");
    expect(html).toMatch(/name="intent"/);
  });

  it("el <select> conserva name=\"city\" — el mismo campo que completeGoogleOnboarding() ya lee del FormData", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toMatch(/<select[^>]*id="city"[^>]*name="city"/);
  });

  it("ya no queda ningún <input id=\"city\"> de texto libre", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toMatch(/<input id="city"/);
  });
});
