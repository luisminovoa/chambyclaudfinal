import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvailabilityWeeklyEditor } from "./AvailabilityWeeklyEditor";
import type { ProfileAvailabilitySlot } from "@/lib/types";

/**
 * FASE 3G — Sección 5A (test §15 item 4, "disponibilidad semanal"), y
 * evidencia estructural de los items 5/6 ("agregar horario"/"eliminar
 * horario"): sin @testing-library/react en el proyecto no hay forma de
 * simular un click real, así que se verifica que los puntos de entrada
 * a esas acciones (botón "Agregar horario", botón "Eliminar horario" por
 * cada slot ya guardado) existen y están conectados a los datos
 * correctos en el render inicial — la lógica que esos clicks disparan
 * (saveAvailability()/deleteAvailability()) ya está cubierta end-to-end
 * en calendar.test.ts (FASE 3F).
 */

vi.mock("@/lib/actions/calendar", () => ({
  saveAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
  getMyAvailability: vi.fn(),
}));

function slot(overrides: Partial<ProfileAvailabilitySlot> = {}): ProfileAvailabilitySlot {
  return {
    id: "slot-1",
    profile_id: "user-1",
    day_of_week: 1,
    start_time: "09:00:00",
    end_time: "13:00:00",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("4. AvailabilityWeeklyEditor — disponibilidad semanal", () => {
  it("renderiza los 7 días de la semana en orden lunes a domingo", () => {
    const html = renderToStaticMarkup(<AvailabilityWeeklyEditor initialSlots={[]} />);
    const order = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    let lastIndex = -1;
    for (const day of order) {
      const idx = html.indexOf(day);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("un día con un rango guardado muestra la hora de inicio y fin", () => {
    const html = renderToStaticMarkup(
      <AvailabilityWeeklyEditor initialSlots={[slot({ start_time: "09:00:00", end_time: "13:00:00" })]} />
    );
    expect(html).toContain("09:00");
    expect(html).toContain("13:00");
  });

  it("un día con múltiples rangos los muestra todos", () => {
    const html = renderToStaticMarkup(
      <AvailabilityWeeklyEditor
        initialSlots={[
          slot({ id: "s1", start_time: "09:00:00", end_time: "13:00:00" }),
          slot({ id: "s2", start_time: "14:00:00", end_time: "18:00:00" }),
        ]}
      />
    );
    expect(html).toContain("09:00");
    expect(html).toContain("14:00");
  });

  it("un día sin rangos (inactivo) no muestra ninguna hora, solo el botón para agregar", () => {
    const html = renderToStaticMarkup(<AvailabilityWeeklyEditor initialSlots={[]} />);
    expect(html).not.toMatch(/\d{2}:\d{2} — \d{2}:\d{2}/);
  });
});

describe("5. AvailabilityWeeklyEditor — punto de entrada para agregar horario", () => {
  it("cada día ofrece un botón 'Agregar horario'", () => {
    const html = renderToStaticMarkup(<AvailabilityWeeklyEditor initialSlots={[]} />);
    const occurrences = html.split("Agregar horario").length - 1;
    expect(occurrences).toBe(7);
  });
});

describe("6. AvailabilityWeeklyEditor — punto de entrada para eliminar horario", () => {
  it("cada rango guardado tiene un botón de eliminar identificado por su horario y día", () => {
    const html = renderToStaticMarkup(
      <AvailabilityWeeklyEditor initialSlots={[slot({ start_time: "09:00:00", end_time: "13:00:00" })]} />
    );
    expect(html).toContain('aria-label="Eliminar horario 09:00-13:00 de Lunes"');
  });

  it("un slot marcado is_active=false se muestra visualmente distinto (tachado)", () => {
    const html = renderToStaticMarkup(
      <AvailabilityWeeklyEditor initialSlots={[slot({ is_active: false })]} />
    );
    expect(html).toContain("line-through");
  });
});
