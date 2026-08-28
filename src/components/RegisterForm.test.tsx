import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterForm, deriveRegisterCity } from "./RegisterForm";
import { CATEGORY_NAMES } from "@/lib/categories";
import type { LocationValue } from "@/components/ui/LocationSelector";

// Mismo patrón que EmployerPublicProfileView.test.tsx: evita depender del
// AppRouterContext real de Next.js en un render aislado con
// renderToStaticMarkup.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// register()/resendConfirmationEmail() son Server Actions ("use server") —
// no se invocan en este test (solo se renderiza el formulario, nunca se
// dispara un submit real), pero useFormState() necesita una referencia de
// función válida para inicializarse sin lanzar.
vi.mock("@/lib/actions/auth", () => ({
  register: vi.fn(),
  resendConfirmationEmail: vi.fn(),
}));

// El paquete `react-dom` de npm (18.3.1) no exporta useFormState/
// useFormStatus en este entorno de test (Next.js los provee vía su propio
// build de React en la app real) — se hace stub aquí únicamente para
// poder renderizar RegisterForm de forma aislada con
// renderToStaticMarkup; no afecta a react-dom/server (módulo distinto),
// que sigue siendo el real.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: (_action: unknown, initialState: unknown) => [initialState, ""],
    useFormStatus: () => ({ pending: false }),
  };
});

describe("RegisterForm — catálogo canónico de categoría (Fase A)", () => {
  it("1) el <select> de categoría (rol worker, activo por defecto) ofrece exactamente las categorías de categories.ts", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    for (const name of CATEGORY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("no queda ninguna categoría hardcodeada fuera del catálogo canónico (p.ej. 'Plomero', 'Conductor', 'Mesero' ya no existen aquí)", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    for (const stale of ["Plomero", "Conductor", "Mesero", "Técnico en computadoras", "Diseñador"]) {
      expect(html).not.toContain(`>${stale}</option>`);
    }
  });

  it("la primera opción es un valor vacío con el texto 'Selecciona tu ocupación'", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain('<option value="" selected="">Selecciona tu ocupación</option>');
  });

  it("4) el campo sigue siendo un <select name=\"category\"> — el mismo nombre que register()/updateProfile() ya leen del FormData", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<select[^>]*\bname="category"/);
  });
});

/**
 * Fase C4-G9.2.3.4 — reemplaza el <select id="city"> de CITY_NAMES
 * (Chiclayo/Trujillo) por el LocationSelector jerárquico real
 * (src/lib/ubigeo.ts), mismo patrón ya probado en
 * EmployerInfoTab.test.tsx/RoleOnboardingForm.test.tsx: se renderiza el
 * componente real (nunca se mockea Ubigeo ni LocationSelector).
 *
 * Este proyecto usa exclusivamente `renderToStaticMarkup` (sin jsdom, ver
 * CLAUDE.md) — no hay forma de simular un `change` real sobre un
 * <select> ni de inyectar un `role`/`state` inicial distinto al que ya
 * arranca el componente (RegisterForm no acepta ningún prop para eso).
 * Por eso:
 * - La habilitación dinámica de Provincia/Distrito al elegir el nivel
 *   anterior NO se reimplementa aquí (ya cubierta en
 *   LocationSelector.test.tsx, que esta fase no debía tocar ni duplicar).
 * - El caso role=employer (que oculta category) y el caso de error/
 *   needsEmailConfirmation (controlados por `state`, fijo a `{}` en este
 *   mock) se verifican mediante inspección estructural del código fuente,
 *   no mediante un render con esos valores — mismo criterio ya usado para
 *   el test AB) de auth.test.ts (verificar el import/JSX real, no
 *   simular la interacción que lo produce).
 */
describe("RegisterForm — ubicación jerárquica (C4-G9.2.3.4)", () => {
  it("A) el formulario muestra el campo Departamento", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain(">Departamento</label>");
    expect(html).toMatch(/<select[^>]*name="department"/);
  });

  it("B) el formulario muestra el campo Provincia", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain(">Provincia</label>");
    expect(html).toMatch(/<select[^>]*name="province"/);
  });

  it("C) el formulario muestra el campo Distrito", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain(">Distrito</label>");
    expect(html).toMatch(/<select[^>]*name="district"/);
  });

  it("D) Provincia empieza deshabilitada sin Departamento", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain('disabled=""');
    expect(html).toContain("Primero elige un departamento");
  });

  it("E) Distrito empieza deshabilitado sin Provincia", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(districtSelect).toContain('disabled=""');
    expect(html).toContain("Primero elige una provincia");
  });

  it("F) existe exactamente una instancia de LocationSelector (un solo grid de 3 <select> jerárquicos, sin una segunda fuente de verdad de ubicación)", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect((html.match(/class="grid gap-4 sm:grid-cols-3"/g) ?? []).length).toBe(1);
    expect((html.match(/name="department"/g) ?? []).length).toBe(1);
    expect((html.match(/name="province"/g) ?? []).length).toBe(1);
    expect((html.match(/name="district"/g) ?? []).length).toBe(1);
  });

  it("G) ya NO existe ningún <select id=\"city\">", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).not.toMatch(/<select id="city"/);
  });

  it("H) ya NO aparece 'Selecciona tu ciudad' ni las ciudades del catálogo antiguo (Chiclayo/Trujillo) como opciones de un <select> de ciudad", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).not.toContain("Selecciona tu ciudad");
    expect(html).not.toMatch(/<option value="Chiclayo">Chiclayo<\/option>/);
    expect(html).not.toMatch(/<option value="Trujillo">Trujillo<\/option>/);
  });

  it("I) existe un <input type=\"hidden\" name=\"city\">", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<input type="hidden" name="city"/);
  });

  it("J) city inicia vacía (sin ubicación elegida todavía, no se inventa ningún valor)", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<input type="hidden" name="city" value=""/);
  });

  it("K) la ubicación es opcional: ningún <select> de department/province/district lleva el atributo `required`", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const departmentSelect = html.match(/<select[^>]*name="department"[^>]*>/)?.[0] ?? "";
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    for (const select of [departmentSelect, provinceSelect, districtSelect]) {
      expect(select).not.toMatch(/\brequired\b/);
    }
  });

  it("L) el formulario no exige ubicación para continuar: en el estado inicial (sin contraseñas escritas todavía) el botón de envío no está deshabilitado por nada relacionado a la ubicación", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    // pwdMismatch/pwdTooShort son ambos false al montar (pwd/confirm
    // arrancan vacíos) — el único `disabled` posible en <button
    // type="submit"> viene de esas dos condiciones, nunca de location.
    const submitButton = html.match(/<button type="submit"[^>]*>/)?.[0] ?? "";
    expect(submitButton).not.toMatch(/disabled/);
  });

  it("M) role worker (activo por defecto) mantiene el campo de categoría", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<select[^>]*name="category"/);
  });

  it("N) role employer no muestra category — verificado por inspección estructural del código fuente: el bloque de category sigue condicionado exactamente a `role === \"worker\"`. No se puede simular un clic sobre el radiogroup de rol sin jsdom (mismo límite ya documentado en RoleOnboardingForm.test.tsx/auth.test.ts) para renderizar RegisterForm ya en modo employer, ya que el componente no acepta ningún prop de rol inicial.", () => {
    const source = readFileSync(new URL("./RegisterForm.tsx", import.meta.url), "utf-8");
    expect(source).toMatch(/\{role === "worker" && \(/);
  });

  it("O) el hidden input `next` continúa funcionando exactamente igual", () => {
    const html = renderToStaticMarkup(<RegisterForm next="/dashboard/employer" />);
    expect(html).toMatch(/<input type="hidden" name="next" value="\/dashboard\/employer"/);
  });

  it("P) el estado de error continúa funcionando — verificado por inspección estructural: el bloque `state.error && (...)` con role=\"alert\" sigue presente sin alterarse. El mock de useFormState fija `state` a `{}` (sin error) en todo este archivo, igual que antes de esta fase, así que no hay forma de renderizar la rama de error sin jsdom/sin cambiar el mock de forma no relacionada a esta tarea.", () => {
    const source = readFileSync(new URL("./RegisterForm.tsx", import.meta.url), "utf-8");
    expect(source).toMatch(/state\.error && \(/);
    expect(source).toContain('role="alert"');
  });

  it("Q) SubmitButton sigue funcionando según la lógica existente (disabled={pwdMismatch || pwdTooShort}), sin ninguna condición nueva agregada por la ubicación", () => {
    const source = readFileSync(new URL("./RegisterForm.tsx", import.meta.url), "utf-8");
    expect(source).toMatch(/<SubmitButton disabled=\{pwdMismatch \|\| pwdTooShort\} \/>/);
  });

  it("no se alteró la lógica de autenticación: register()/resendConfirmationEmail() se mockean igual que antes, sin nuevas dependencias", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain('name="role"');
  });
});

/**
 * Test específico de derivación de `city` (sección 13 del pedido) — se
 * prueba deriveRegisterCity() como función pura, sin necesitar simular
 * ninguna selección real en el DOM. No se importa desde auth.ts (esa es
 * una función distinta, para el flujo del backend) — esta es la copia
 * local de RegisterForm.tsx, mismo criterio ya usado para
 * deriveOnboardingCity en RoleOnboardingForm.tsx.
 */
/**
 * Fase C4-G10.6 — tests de regresión/documentación, SIN cambios de
 * producción. La auditoría pre-merge previa (C4-G10.5) concluyó
 * erróneamente que RegisterForm.tsx no enviaba department/province/
 * district al servidor: ese diagnóstico buscó el literal `name="department"`
 * dentro de ESTE archivo y, al no encontrarlo aquí, asumió que el campo no
 * existía — sin considerar que LocationSelector.tsx (componente hijo,
 * renderizado sin envolver dentro del mismo `<form action={formAction}>`)
 * es quien realmente define esos `<select>`. Un componente hijo de React
 * no crea ningún límite para `new FormData(formElement)`: el navegador
 * serializa TODO control con `name` que sea descendiente del `<form>` en
 * el DOM final, sin importar en qué componente se originó. Estos tests
 * demuestran esa pertenencia sobre el HTML real (no sobre el código
 * fuente de RegisterForm.tsx en aislado), para que una futura auditoría no
 * repita el mismo error de método.
 */
describe("RegisterForm — regresión: serialización Ubigeo dentro del <form> nativo (C4-G10.6)", () => {
  it("includes LocationSelector controls inside the native form", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    // A) existe un único <form> (el que lleva action={formAction} en el
    // código fuente — el mock de useFormState hace que el atributo
    // renderizado sea `action=""`, pero solo hay UN <form> en todo el
    // árbol, así que no hay ambigüedad de a cuál pertenecen los controles).
    const formMatches = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? [];
    expect(formMatches).toHaveLength(1);
    const formHtml = formMatches[0];

    // B/C/D) department/province/district están DENTRO de ese único
    // <form> — no son hermanos externos ni quedan fuera de su cierre.
    expect(formHtml).toMatch(/<select[^>]*name="department"/);
    expect(formHtml).toMatch(/<select[^>]*name="province"/);
    expect(formHtml).toMatch(/<select[^>]*name="district"/);

    // E) el hidden de city también está dentro del mismo <form>.
    expect(formHtml).toMatch(/<input type="hidden" name="city"/);
  });

  it("F) existe exactamente un control por nivel — una sola fuente de verdad (LocationSelector), sin ningún <select>/<input> de ubicación duplicado en otro lugar del árbol", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect((html.match(/name="department"/g) ?? []).length).toBe(1);
    expect((html.match(/name="province"/g) ?? []).length).toBe(1);
    expect((html.match(/name="district"/g) ?? []).length).toBe(1);
    expect((html.match(/name="city"/g) ?? []).length).toBe(1);
  });

  it("G) no existe ningún <select id=\"city\"> residual", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).not.toMatch(/<select id="city"/);
  });

  it("H) no queda ninguna referencia al catálogo antiguo CITY_NAMES — ni en el HTML renderizado ni como import real del componente (los comentarios pueden mencionarlo como contexto histórico, pero no debe existir un `import { CITY_NAMES }`)", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const source = readFileSync(new URL("./RegisterForm.tsx", import.meta.url), "utf-8");
    expect(source).not.toMatch(/import\s*\{[^}]*\bCITY_NAMES\b[^}]*\}\s*from/);
    expect(html).not.toContain("Selecciona tu ciudad");
  });

  it("la cascada `disabled` de Provincia/Distrito es progresiva, NO una desconexión del <form>: un <select disabled> se excluye del FormData nativo solo mientras su nivel superior está vacío — exactamente la semántica ya aprobada (sin ubicación → province/district ausentes del envío; con department elegido → province ya se habilita; con province elegido → district ya se habilita). Departamento en sí nunca está disabled, así que jamás queda excluido.", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const departmentSelect = html.match(/<select[^>]*name="department"[^>]*>/)?.[0] ?? "";
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(departmentSelect).not.toContain('disabled=""');
    // Estado inicial (sin ubicación elegida todavía): province/district
    // arrancan disabled — esto es cascada de LocationSelector (ya probada
    // de forma aislada en LocationSelector.test.tsx), no un problema de
    // integración de RegisterForm ni una razón para agregar otro campo.
    expect(provinceSelect).toContain('disabled=""');
    expect(districtSelect).toContain('disabled=""');
  });
});

describe("deriveRegisterCity() — derivación local de city (C4-G9.2.3.4)", () => {
  it("district presente → city = district", () => {
    const location: LocationValue = { department: "Lambayeque", province: "Chiclayo", district: "Pimentel" };
    expect(deriveRegisterCity(location)).toBe("Pimentel");
  });

  it("solo province (sin district) → city = province", () => {
    const location: LocationValue = { department: "Lambayeque", province: "Chiclayo", district: "" };
    expect(deriveRegisterCity(location)).toBe("Chiclayo");
  });

  it("solo department → city = '' (no se inventa ningún valor)", () => {
    const location: LocationValue = { department: "Lambayeque", province: "", district: "" };
    expect(deriveRegisterCity(location)).toBe("");
  });

  it("sin ubicación → city = ''", () => {
    const location: LocationValue = { department: "", province: "", district: "" };
    expect(deriveRegisterCity(location)).toBe("");
  });
});
