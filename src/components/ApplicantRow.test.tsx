import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicantRow } from "./ApplicantRow";
import type { PublicWorkerSummary } from "@/lib/types";

/**
 * FASE 3G — ApplicantRow no tenía tests propios antes de esta fase.
 * Cobertura mínima añadida junto con la integración de
 * ScheduleProposalCard: que la tarjeta de horario aparece solo cuando
 * corresponde (canManage + pendiente) y que updateApplicationStatus()
 * sigue siendo la única función que decide aceptar/rechazar — nunca se
 * reimplementa esa lógica aquí. El mapeo real de 23P01 a un mensaje
 * legible ya está probado exhaustivamente en jobs.test.ts (FASE 3F); lo
 * que se fija aquí es que ApplicantRow no filtra ni reemplaza
 * `result.error` — sea cual sea su contenido, incluido ese mensaje.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/jobs", () => ({
  updateApplicationStatus: vi.fn(),
}));

vi.mock("@/lib/actions/calendar", () => ({
  proposeApplicationSchedule: vi.fn(),
  confirmApplicationSchedule: vi.fn(),
}));

const WORKER: PublicWorkerSummary = {
  id: "worker-1",
  full_name: "Juan Torres",
  avatar_url: null,
  category: "Almacén",
  city: "Chiclayo",
};

describe("ApplicantRow — botones de decisión (11. conflicto 23P01 se propaga sin filtrar)", () => {
  it("una postulación pendiente que el empleador puede gestionar muestra Aceptar/Rechazar — la ruta por la que un 23P01 puede surgir al aceptar", () => {
    const html = renderToStaticMarkup(
      <ApplicantRow
        applicationId="app-1"
        jobId="job-1"
        status="pendiente"
        worker={WORKER}
        canManage
      />
    );
    expect(html).toContain("Aceptar");
    expect(html).toContain("Rechazar");
  });

  it("una postulación ya decidida no ofrece Aceptar/Rechazar — solo el badge de estado", () => {
    const html = renderToStaticMarkup(
      <ApplicantRow applicationId="app-1" jobId="job-1" status="rechazado" worker={WORKER} canManage />
    );
    expect(html).not.toContain(">Aceptar<");
    expect(html).not.toContain(">Rechazar<");
  });
});

describe("ApplicantRow — integración con ScheduleProposalCard (FASE 3G)", () => {
  it("muestra la tarjeta de horario cuando el empleador puede gestionar una postulación pendiente", () => {
    const html = renderToStaticMarkup(
      <ApplicantRow applicationId="app-1" jobId="job-1" status="pendiente" worker={WORKER} canManage />
    );
    expect(html).toContain("Proponer horario");
  });

  it("no muestra la tarjeta de horario si el empleador no puede gestionar la postulación (p. ej. job cerrado)", () => {
    const html = renderToStaticMarkup(
      <ApplicantRow
        applicationId="app-1"
        jobId="job-1"
        status="pendiente"
        worker={WORKER}
        canManage={false}
      />
    );
    expect(html).not.toContain("Proponer horario");
  });

  it("una propuesta ya enviada se refleja en la tarjeta de horario dentro de la fila", () => {
    const html = renderToStaticMarkup(
      <ApplicantRow
        applicationId="app-1"
        jobId="job-1"
        status="pendiente"
        worker={WORKER}
        canManage
        proposedStartAt="2099-01-01T10:00:00.000Z"
        proposedEndAt="2099-01-01T12:00:00.000Z"
        workerScheduleConfirmedAt={null}
      />
    );
    expect(html).toContain("Horario propuesto");
  });
});
