import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterForm } from "./RegisterForm";
import { CATEGORY_NAMES } from "@/lib/categories";

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
