import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployerJobRow } from "./EmployerJobRow";
import type { Job } from "@/lib/types";

/**
 * Fase 4 / C4-G14 — Cambio B (CTA "Calificar trabajador") y Cambio C
 * (unificación a completeJob()) en EmployerJobRow.tsx. Mismo patrón que
 * WorkerProfileActions.test.tsx: mocks de next/link y next/navigation
 * para evitar el AppRouterContext real, renderToStaticMarkup para lo que
 * es función directa de props, e inspección estática del código fuente
 * para lo que requiere simular una interacción (imposible sin jsdom en
 * este repo).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/jobs", () => ({
  updateJobStatus: vi.fn(),
  completeJob: vi.fn(),
  deleteJob: vi.fn(),
}));

function baseJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Electricista para local",
    city: "Lima",
    pay_amount: 100,
    pay_type: "fijo",
    status: "abierto",
    employer_id: "employer-1",
    assigned_worker_id: null,
    worker_reported_finished_at: null,
    ...overrides,
  } as Job;
}

describe("EmployerJobRow — CTA 'Calificar trabajador' (Fase 4 / C4-G14)", () => {
  it("A) job no completado ('en_progreso') → sin CTA de calificar", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "en_progreso", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).not.toContain("Calificar trabajador");
  });

  it("A) job no completado ('abierto') → sin CTA de calificar", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow job={baseJob({ status: "abierto" })} applicantsCount={0} alreadyRated={false} />
    );
    expect(html).not.toContain("Calificar trabajador");
  });

  it("B) job completado + assigned_worker_id + no calificado aún → aparece 'Calificar trabajador'", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "completado", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).toContain("Calificar trabajador");
  });

  it("C) el CTA enlaza exactamente a /jobs/[id]#rating", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ id: "job-42", status: "completado", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).toMatch(/<a href="\/jobs\/job-42#rating"/);
  });

  it("D) ya calificado (alreadyRated=true) → el CTA no aparece aunque el job esté completado con worker asignado", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "completado", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={true}
      />
    );
    expect(html).not.toContain("Calificar trabajador");
  });

  it("E) sin assigned_worker_id (null) → el CTA no aparece aunque el job esté completado", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "completado", assigned_worker_id: null })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).not.toContain("Calificar trabajador");
  });

  it("H) el badge de estado siempre refleja job.status, sin relación con el CTA de calificar", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "completado", assigned_worker_id: "worker-1" })}
        applicantsCount={3}
        alreadyRated={false}
      />
    );
    expect(html).toContain("3 postulantes");
  });

  it("I) job.employer_id no se usa para decidir el CTA en el cliente — la autorización real vive server-side (ratedJobIds calculado con rater_id=auth.uid() en EmployerDashboardPage); el componente confía únicamente en la prop alreadyRated", () => {
    const source = readFileSync(new URL("./EmployerJobRow.tsx", import.meta.url), "utf-8");
    expect(source).not.toMatch(/job\.employer_id/);
  });
});

/**
 * Fase 8 (C4-G21): completeJob() ya no es unilateral — el botón de
 * confirmación del empleador solo debe aparecer si el trabajador ya
 * reportó el trabajo como terminado (job.worker_reported_finished_at).
 */
describe("EmployerJobRow — confirmación bilateral (Fase 8 / C4-G21)", () => {
  it("en_progreso SIN reporte del trabajador: muestra 'Esperando al trabajador', no el botón de confirmar", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({
          status: "en_progreso",
          assigned_worker_id: "worker-1",
          worker_reported_finished_at: null,
        })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).toContain("Esperando al trabajador");
    expect(html).not.toContain("Confirmar trabajo terminado");
  });

  it("en_progreso CON reporte del trabajador: muestra 'Confirmar trabajo terminado', no el estado de espera", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({
          status: "en_progreso",
          assigned_worker_id: "worker-1",
          worker_reported_finished_at: "2026-01-01T00:00:00Z",
        })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).toContain("Confirmar trabajo terminado");
    expect(html).not.toContain("Esperando al trabajador");
  });

  it("abierto: ni el botón de confirmar ni el estado de espera aparecen (sin worker asignado en progreso)", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "abierto", worker_reported_finished_at: null })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).not.toContain("Confirmar trabajo terminado");
    expect(html).not.toContain("Esperando al trabajador");
  });
});

describe("EmployerJobRow — Completar usa completeJob() (Cambio C, Fase 4 / C4-G14)", () => {
  const source = readFileSync(new URL("./EmployerJobRow.tsx", import.meta.url), "utf-8");

  it("F) handleComplete() llama a completeJob(job.id), no a updateJobStatus()", () => {
    const fnMatch = source.match(/function handleComplete\(\)[\s\S]*?\n  \}/);
    expect(fnMatch).not.toBeNull();
    // Se descartan las líneas de comentario (incluida la nota histórica que
    // menciona updateJobStatus() como lo que este cambio reemplaza) para
    // verificar únicamente el código ejecutable.
    const codeLines = fnMatch![0]
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeLines).toMatch(/const result = await completeJob\(job\.id\);/);
    expect(codeLines).not.toContain("updateJobStatus");
  });

  it("handleCancel() sigue usando updateJobStatus(job.id, \"cancelado\") — fuera de scope, sin cambios", () => {
    const fnMatch = source.match(/function handleCancel\(\)[\s\S]*?\n  \}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/updateJobStatus\(job\.id, "cancelado"\)/);
  });

  it("G) un error de completeJob() hace return antes del toast de éxito o de router.refresh() — el CTA de calificar nunca se muestra basado en un estado optimista incorrecto", () => {
    const fnMatch = source.match(/function handleComplete\(\)[\s\S]*?\n  \}/);
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/if \(result\.error\) \{\s*toast\(result\.error, "error"\);\s*return;\s*\}/);
  });
});

/**
 * P1 (auditoría post-V6): deleteJob() ahora rechaza jobs
 * completado/cancelado (0048_protect_job_deletion.sql +
 * src/lib/actions/jobs.ts). El botón "Eliminar" ya no debe ofrecerse
 * para esos dos estados — antes se mostraba sin ninguna condición de
 * status, ofreciendo una acción que el servidor iba a rechazar.
 */
describe("EmployerJobRow — botón Eliminar respeta jobs terminales (P1)", () => {
  it("abierto: el botón Eliminar aparece", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow job={baseJob({ status: "abierto" })} applicantsCount={0} alreadyRated={false} />
    );
    expect(html).toContain("Eliminar");
  });

  it("en_progreso: el botón Eliminar aparece", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "en_progreso", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={false}
      />
    );
    expect(html).toContain("Eliminar");
  });

  it("completado: el botón Eliminar NO aparece", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow
        job={baseJob({ status: "completado", assigned_worker_id: "worker-1" })}
        applicantsCount={0}
        alreadyRated={true}
      />
    );
    expect(html).not.toContain("Eliminar");
  });

  it("cancelado: el botón Eliminar NO aparece", () => {
    const html = renderToStaticMarkup(
      <EmployerJobRow job={baseJob({ status: "cancelado" })} applicantsCount={0} alreadyRated={false} />
    );
    expect(html).not.toContain("Eliminar");
  });
});
