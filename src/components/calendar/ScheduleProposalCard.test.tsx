import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleProposalCard } from "./ScheduleProposalCard";

/**
 * FASE 3G — Secciones 8/9 (tests §15 items 9-10). Cubre las 6
 * combinaciones reales de estado (viewerRole × propuesta × confirmación)
 * en el render inicial — el propio click de "Proponer"/"Confirmar" ya
 * está cubierto a nivel de Server Action en calendar.test.ts (FASE 3F);
 * aquí se fija que la UI muestra la tarjeta correcta para cada estado y
 * nunca dos a la vez.
 */

vi.mock("@/lib/actions/calendar", () => ({
  proposeApplicationSchedule: vi.fn(),
  confirmApplicationSchedule: vi.fn(),
}));

const PROPOSED_START = "2099-01-01T10:00:00.000Z";
const PROPOSED_END = "2099-01-01T12:00:00.000Z";

describe("ScheduleProposalCard — postulación ya decidida", () => {
  it("no renderiza nada si la postulación no está pendiente (ni para employer ni para worker)", () => {
    const commonProps = {
      applicationId: "app-1",
      status: "aceptado",
      proposedStartAt: PROPOSED_START,
      proposedEndAt: PROPOSED_END,
      workerScheduleConfirmedAt: null,
    };
    expect(renderToStaticMarkup(<ScheduleProposalCard {...commonProps} viewerRole="employer" />)).toBe("");
    expect(renderToStaticMarkup(<ScheduleProposalCard {...commonProps} viewerRole="worker" />)).toBe("");
  });
});

describe("9. ScheduleProposalCard — propuesta de horario (empleador)", () => {
  it("sin propuesta previa muestra el formulario 'Proponer horario' con fecha, hora inicio y hora fin", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={null}
        proposedEndAt={null}
        workerScheduleConfirmedAt={null}
        viewerRole="employer"
      />
    );
    expect(html).toContain("Proponer horario");
    expect(html).toContain('type="date"');
    expect(html).toContain('type="time"');
  });

  it("con una propuesta ya enviada (no confirmada) muestra el badge 'Horario propuesto' y el horario", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={PROPOSED_START}
        proposedEndAt={PROPOSED_END}
        workerScheduleConfirmedAt={null}
        viewerRole="employer"
      />
    );
    expect(html).toContain("Horario propuesto");
    expect(html).toContain("Editar");
  });

  it("una vez confirmada por el worker, el empleador ve 'Horario confirmado'", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={PROPOSED_START}
        proposedEndAt={PROPOSED_END}
        workerScheduleConfirmedAt="2099-01-01T08:00:00.000Z"
        viewerRole="employer"
      />
    );
    expect(html).toContain("Horario confirmado");
  });
});

describe("10. ScheduleProposalCard — confirmación de horario (worker)", () => {
  it("sin ninguna propuesta del empleador no muestra nada", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={null}
        proposedEndAt={null}
        workerScheduleConfirmedAt={null}
        viewerRole="worker"
      />
    );
    expect(html).toBe("");
  });

  it("con una propuesta pendiente de confirmar muestra 'Te propusieron este horario' y el botón 'Confirmar horario'", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={PROPOSED_START}
        proposedEndAt={PROPOSED_END}
        workerScheduleConfirmedAt={null}
        viewerRole="worker"
      />
    );
    expect(html).toContain("Te propusieron este horario");
    expect(html).toContain("Confirmar horario");
  });

  it("una vez confirmado, muestra 'Horario confirmado' y ya no ofrece el botón de confirmar", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={PROPOSED_START}
        proposedEndAt={PROPOSED_END}
        workerScheduleConfirmedAt="2099-01-01T08:00:00.000Z"
        viewerRole="worker"
      />
    );
    expect(html).toContain("Horario confirmado");
    expect(html).not.toContain("Confirmar horario");
  });

  it("el worker nunca ve un campo editable de fecha/hora — no puede modificar la propuesta directamente", () => {
    const html = renderToStaticMarkup(
      <ScheduleProposalCard
        applicationId="app-1"
        status="pendiente"
        proposedStartAt={PROPOSED_START}
        proposedEndAt={PROPOSED_END}
        workerScheduleConfirmedAt={null}
        viewerRole="worker"
      />
    );
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain('type="time"');
  });
});
