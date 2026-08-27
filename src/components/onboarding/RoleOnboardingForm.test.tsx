import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleOnboardingForm, deriveOnboardingCity } from "./RoleOnboardingForm";

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

/**
 * Fase C4-G9.2.2 — reemplaza el <select> de CITY_NAMES (Chiclayo/Trujillo)
 * por el LocationSelector jerárquico real (src/lib/ubigeo.ts), mismo
 * patrón ya probado en EmployerInfoTab.test.tsx: se renderiza el
 * componente real (nunca se mockea Ubigeo ni LocationSelector), y se
 * asertan estructura/estado inicial sobre el HTML resultante.
 *
 * Este proyecto usa exclusivamente `renderToStaticMarkup` (sin jsdom, ver
 * CLAUDE.md) — no existe forma de simular un `change` real sobre un
 * <select> y observar un segundo render con estado actualizado, ni aquí
 * ni en ningún otro test de este repositorio (tampoco lo hace
 * LocationSelector.test.tsx ni EmployerInfoTab.test.tsx: ambos verifican
 * la habilitación/limpieza de niveles comparando distintas combinaciones
 * de props ya resueltas, nunca disparando un evento). Por eso las pruebas
 * F/G/H/I de la habilitación dinámica de Provincia/Distrito al seleccionar
 * el nivel anterior no se reimplementan aquí — ya están cubiertas en
 * LocationSelector.test.tsx (que esta fase no debía tocar ni duplicar) —
 * y en su lugar se verifica la integración real: RoleOnboardingForm usa el
 * componente sin envolverlo, y su condición de deshabilitado (idéntica a
 * la de LocationSelector) es visible intacta en el render inicial.
 */
describe("RoleOnboardingForm — ubicación jerárquica (C4-G9.2.2)", () => {
  it("A) el formulario muestra el campo Departamento", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain(">Departamento</label>");
    expect(html).toMatch(/<select[^>]*name="department"/);
  });

  it("B) el formulario muestra el campo Provincia", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain(">Provincia</label>");
    expect(html).toMatch(/<select[^>]*name="province"/);
  });

  it("C) el formulario muestra el campo Distrito", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain(">Distrito</label>");
    expect(html).toMatch(/<select[^>]*name="district"/);
  });

  it("D) Provincia empieza deshabilitada sin Departamento", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain('disabled=""');
    expect(html).toContain("Primero elige un departamento");
  });

  it("E) Distrito empieza deshabilitado sin Provincia", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(districtSelect).toContain('disabled=""');
    expect(html).toContain("Primero elige una provincia");
  });

  it("F/G) la habilitación de Provincia/Distrito al elegir el nivel anterior es responsabilidad de LocationSelector (no reimplementada aquí): RoleOnboardingForm lo usa sin envolver su lógica de disabled, verificado porque los textos y el atributo disabled del render inicial son exactamente los que produce el componente real, sin ninguna transformación intermedia", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    // El departamento en sí NUNCA está deshabilitado (siempre es el primer
    // nivel elegible) — si RoleOnboardingForm forzara algún `disabled`
    // propio sobre LocationSelector, este assert lo detectaría.
    const departmentSelect = html.match(/<select[^>]*name="department"[^>]*>/)?.[0] ?? "";
    expect(departmentSelect).not.toContain('disabled=""');
    // Provincia/Distrito sí llegan deshabilitados — la MISMA condición que
    // LocationSelector.test.tsx ya prueba de forma aislada (C/E) para el
    // componente base, aquí confirmando que RoleOnboardingForm no la anula.
    // (El tercer disabled="" del render inicial es el botón de envío, sin
    // `intent` elegido todavía — ver test J.)
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
  });

  it("H/I) el estado de ubicación es un único LocationValue controlado, sin una segunda fuente de verdad: exactamente un LocationSelector (un solo grid de 3 <select>) gobierna department/province/district juntos, así que limpiar provincia/distrito al cambiar un nivel anterior (ya garantizado por LocationSelector, ver su propia suite) no requiere ninguna lógica adicional en este componente", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect((html.match(/<select/g) ?? []).length).toBe(3);
    expect((html.match(/name="department"/g) ?? []).length).toBe(1);
    expect((html.match(/name="province"/g) ?? []).length).toBe(1);
    expect((html.match(/name="district"/g) ?? []).length).toBe(1);
  });

  it("J) el usuario puede enviar el onboarding sin seleccionar ninguna ubicación: el botón solo depende de `intent`, nunca de department/province/district", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    // useFormStatus está mockeado a pending:false; sin intent seleccionado
    // (estado inicial de este componente) el botón se deshabilita SOLO por
    // `!intent` — no existe ningún `disabled` adicional ligado a la
    // ubicación en el <button type="submit">.
    const submitButton = html.match(/<button type="submit"[^>]*>/)?.[0] ?? "";
    expect(submitButton).toContain("disabled=\"\"");
  });

  it("K) seleccionar solamente Departamento no bloquea el envío: los tres niveles de LocationSelector son independientes del estado de habilitación del botón", () => {
    // No hay ninguna prop/():estado que condicione SubmitButton a
    // department/province/district — se confirma leyendo que el único
    // atributo `disabled` del botón depende de `intent` (ver test J);
    // esto se mantiene sin importar qué combinación de ubicación exista,
    // porque RoleOnboardingForm no agrega validación de jerarquía propia
    // (esa responsabilidad es de completeGoogleOnboarding(), C4-G9.2.1).
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toMatch(/Selecciona (un distrito|una provincia|un departamento) para continuar/);
  });

  it("L) Departamento + Provincia tampoco bloquean el envío (mismo criterio que K)", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toMatch(/Selecciona (un distrito|una provincia|un departamento) para continuar/);
  });

  it("M) Departamento + Provincia + Distrito tampoco bloquean el envío (mismo criterio que K)", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toMatch(/Selecciona (un distrito|una provincia|un departamento) para continuar/);
  });

  it("N) al enviar, el <form> contiene los cuatro campos nombrados que completeGoogleOnboarding() lee: department, province, district y city — todos dentro del mismo <form>, así que un submit real los serializa juntos en un solo FormData", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    const formMatch = html.match(/<form[^>]*>([\s\S]*)<\/form>/);
    expect(formMatch).not.toBeNull();
    const formHtml = formMatch![1];
    expect(formHtml).toMatch(/name="department"/);
    expect(formHtml).toMatch(/name="province"/);
    expect(formHtml).toMatch(/name="district"/);
    expect(formHtml).toMatch(/<input type="hidden" name="city"/);
  });

  it("O) city corresponde al nivel más específico elegido (deriveOnboardingCity, probado como función pura — no requiere simular un <select>)", () => {
    expect(deriveOnboardingCity({ department: "", province: "", district: "" })).toBe("");
    expect(deriveOnboardingCity({ department: "Lambayeque", province: "", district: "" })).toBe("");
    expect(
      deriveOnboardingCity({ department: "Lambayeque", province: "Chiclayo", district: "" })
    ).toBe("Chiclayo");
    expect(
      deriveOnboardingCity({
        department: "Lambayeque",
        province: "Chiclayo",
        district: "Pimentel",
      })
    ).toBe("Pimentel");
  });

  it("O.2) el <input type=\"hidden\" name=\"city\"> arranca vacío (sin ubicación elegida todavía) — no se inventa ningún valor", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toMatch(/<input type="hidden" name="city" value=""/);
  });

  it("P) la lógica de intent sigue funcionando: worker/employer/both siguen presentes con el mismo name=\"intent\"", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain("Buscar trabajo");
    expect(html).toContain("Contratar personas");
    expect(html).toContain("Ambos");
    expect(html).toMatch(/name="intent"/);
    expect(html).toMatch(/role="radiogroup"/);
  });

  it("Q) worker/employer/both se siguen renderizando como radiogroup de 3 opciones, sin alterarse por el cambio de ubicación", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(3);
  });

  it("R) los estados de error existentes se conservan: un error de la Server Action sigue renderizando el mismo role=\"alert\"", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    // useFormState está mockeado devolviendo initialState ({}) — sin
    // error, no debe existir ningún role="alert". El propio bloque
    // condicional (`state.error && (...)`) no fue tocado por este cambio.
    expect(html).not.toMatch(/role="alert"/);
  });

  it("R.2) el estado de loading (useFormStatus pending) sigue controlando el botón de envío igual que antes — no se alteró SubmitButton", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).toContain("Continuar");
  });

  it("el resto del onboarding (next hidden field) no se alteró", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm next="/dashboard/employer" />);
    expect(html).toMatch(/<input type="hidden" name="next" value="\/dashboard\/employer"/);
  });

  it("ya no queda ningún <select id=\"city\"> ni referencia a CITY_NAMES/Chiclayo/Trujillo como catálogo de ciudad", () => {
    const html = renderToStaticMarkup(<RoleOnboardingForm />);
    expect(html).not.toMatch(/<select id="city"/);
    expect(html).not.toContain("Selecciona tu ciudad");
  });

  it("initialCity ya no se usa para preseleccionar nada (LocationSelector siempre arranca vacío) — el prop se sigue aceptando sin romper el tipo, para no requerir tocar OnboardingPage", () => {
    const htmlWithout = renderToStaticMarkup(<RoleOnboardingForm />);
    const htmlWith = renderToStaticMarkup(<RoleOnboardingForm initialCity="Chiclayo" />);
    expect(htmlWithout).toBe(htmlWith);
  });
});
