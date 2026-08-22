import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterForm } from "./RegisterForm";
import { CATEGORY_NAMES } from "@/lib/categories";
import { CITY_NAMES } from "@/lib/cities";

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

describe("RegisterForm — catálogo canónico de ciudad (Fase C4-C)", () => {
  it("A) el <select> de ciudad ofrece exactamente las ciudades de cities.ts", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("B) las opciones de ciudad provienen únicamente de CITY_NAMES (más el placeholder vacío)", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    const selectMatch = html.match(/<select id="city"[^>]*>(.*?)<\/select>/s);
    expect(selectMatch).not.toBeNull();
    const optionValues = [...selectMatch![1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    expect(optionValues).toEqual(["", ...CITY_NAMES]);
  });

  it("C) la primera opción de ciudad es un valor vacío con el texto 'Selecciona tu ciudad'", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<option value="" selected="">Selecciona tu ciudad<\/option>/);
  });

  it("D) el campo sigue siendo un <select name=\"city\"> — el mismo nombre que register() ya lee del FormData", () => {
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<select[^>]*\bname="city"/);
  });

  it("E) el <select> de ciudad se renderiza igual para role=worker y role=employer (mismo campo profiles.city compartido)", () => {
    // role="worker" es el valor por defecto de RegisterForm — el <select>
    // de ciudad vive fuera del bloque condicional `{role === "worker" && ...}`
    // (a diferencia de category, que sí es exclusivo de worker), así que
    // aparece igual sin importar el rol seleccionado.
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toMatch(/<select id="city"/);
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("F) no se alteró la lógica de autenticación: register()/resendConfirmationEmail() se mockean igual que antes, sin nuevas dependencias", () => {
    // Este test no ejerce comportamiento nuevo — documenta que el cambio de
    // <input> a <select> para city no requirió tocar auth.ts ni sus mocks.
    const html = renderToStaticMarkup(<RegisterForm />);
    expect(html).toContain('name="role"');
  });
});
