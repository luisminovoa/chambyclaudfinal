import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvailabilityExceptionsEditor } from "./AvailabilityExceptionsEditor";
import type { ProfileAvailabilityException } from "@/lib/types";

/** FASE 3G — Sección 6 (tests §15 items 7-8). Mismo criterio de cobertura que AvailabilityWeeklyEditor.test.tsx. */

vi.mock("@/lib/actions/calendar", () => ({
  saveAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
  getMyAvailability: vi.fn(),
}));

function exception(overrides: Partial<ProfileAvailabilityException> = {}): ProfileAvailabilityException {
  return {
    id: "exc-1",
    profile_id: "user-1",
    exception_date: "2099-12-24",
    is_available: false,
    start_time: null,
    end_time: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("7. AvailabilityExceptionsEditor — excepción 'no disponible'", () => {
  it("una excepción con is_available=false se muestra como 'No disponible', sin horario", () => {
    const html = renderToStaticMarkup(
      <AvailabilityExceptionsEditor initialExceptions={[exception({ is_available: false })]} />
    );
    expect(html).toContain("No disponible");
  });
});

describe("8. AvailabilityExceptionsEditor — excepción 'disponible en horario especial'", () => {
  it("una excepción con is_available=true muestra el horario especial completo", () => {
    const html = renderToStaticMarkup(
      <AvailabilityExceptionsEditor
        initialExceptions={[
          exception({ is_available: true, start_time: "10:00:00", end_time: "14:00:00" }),
        ]}
      />
    );
    expect(html).toContain("Disponible");
    expect(html).toContain("10:00");
    expect(html).toContain("14:00");
  });
});

describe("AvailabilityExceptionsEditor — estado vacío y punto de entrada", () => {
  it("sin excepciones muestra un mensaje explicativo en vez de una lista vacía silenciosa", () => {
    const html = renderToStaticMarkup(<AvailabilityExceptionsEditor initialExceptions={[]} />);
    expect(html).toContain("No tienes excepciones registradas.");
  });

  it("siempre ofrece un botón 'Agregar excepción'", () => {
    const html = renderToStaticMarkup(<AvailabilityExceptionsEditor initialExceptions={[]} />);
    expect(html).toContain("Agregar excepción");
  });

  it("cada excepción tiene un botón de eliminar identificado por su fecha", () => {
    const html = renderToStaticMarkup(
      <AvailabilityExceptionsEditor initialExceptions={[exception({ exception_date: "2099-12-24" })]} />
    );
    expect(html).toMatch(/aria-label="Eliminar excepción del/);
  });
});
