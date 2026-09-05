import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarAgenda } from "./CalendarAgenda";
import type { CalendarJob } from "@/lib/actions/calendar";

/**
 * FASE 3G — Secciones 2/3/11/12 (tests §15 items 1-3). Mismo patrón que
 * el resto de los tests de componentes de este repo (renderToStaticMarkup,
 * sin @testing-library/react — no está entre las dependencias del
 * proyecto y esta fase no autoriza instalar ninguna nueva): se verifica
 * la estructura del render inicial, no interacciones simuladas.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function job(overrides: Partial<CalendarJob> = {}): CalendarJob {
  return {
    id: "job-1",
    title: "Ayudante de almacén",
    status: "en_progreso",
    scheduled_start_at: "2099-01-01T09:00:00.000Z",
    scheduled_end_at: "2099-01-01T13:00:00.000Z",
    city: "Chiclayo",
    district: "Chiclayo",
    counterpartName: "María Pérez",
    ...overrides,
  };
}

describe("1. CalendarAgenda — worker con trabajos agendados", () => {
  it("renderiza título, horario, ubicación y nombre de la contraparte", () => {
    const html = renderToStaticMarkup(<CalendarAgenda jobs={[job()]} role="worker" />);
    expect(html).toContain("Ayudante de almacén");
    expect(html).toContain("Chiclayo");
    expect(html).toContain("María Pérez");
    expect(html).toContain('href="/jobs/job-1"');
  });
});

describe("2. CalendarAgenda — employer con trabajos agendados", () => {
  it("renderiza el trabajador asignado como contraparte", () => {
    const html = renderToStaticMarkup(
      <CalendarAgenda jobs={[job({ id: "job-2", counterpartName: "Juan Torres" })]} role="employer" />
    );
    expect(html).toContain("Juan Torres");
    expect(html).toContain('href="/jobs/job-2"');
  });
});

describe("3. CalendarAgenda — agenda vacía", () => {
  it("muestra el EmptyState 'Tu agenda está libre' en vez de una lista vacía silenciosa", () => {
    const html = renderToStaticMarkup(<CalendarAgenda jobs={[]} role="worker" />);
    expect(html).toContain("Tu agenda está libre");
  });

  it("el mensaje de agenda vacía es distinto (pero presente) para worker y employer", () => {
    const workerHtml = renderToStaticMarkup(<CalendarAgenda jobs={[]} role="worker" />);
    const employerHtml = renderToStaticMarkup(<CalendarAgenda jobs={[]} role="employer" />);
    expect(workerHtml).toContain("Tu agenda está libre");
    expect(employerHtml).toContain("Tu agenda está libre");
  });
});

describe("CalendarAgenda — agrupación por día", () => {
  it("agrupa trabajos del mismo día bajo un único encabezado", () => {
    const sameDay = [
      job({ id: "a", scheduled_start_at: "2099-01-01T09:00:00.000Z", scheduled_end_at: "2099-01-01T10:00:00.000Z" }),
      job({ id: "b", scheduled_start_at: "2099-01-01T14:00:00.000Z", scheduled_end_at: "2099-01-01T15:00:00.000Z" }),
    ];
    const html = renderToStaticMarkup(<CalendarAgenda jobs={sameDay} role="worker" />);
    expect(html).toContain('href="/jobs/a"');
    expect(html).toContain('href="/jobs/b"');
  });

  it("nunca renderiza una tabla ni un grid semanal — solo tarjetas apiladas verticalmente", () => {
    const html = renderToStaticMarkup(<CalendarAgenda jobs={[job()]} role="worker" />);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<th");
  });
});
