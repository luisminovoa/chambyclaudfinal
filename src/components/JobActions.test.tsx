import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobActions } from "./JobActions";

/**
 * Fase 4 / C4-G14 — Cambio A: JobActions.tsx ahora llama a router.refresh()
 * tras un completeJob() exitoso, la causa raíz #1 del reporte real
 * ("al poner completa debe salir la opción de calificar instantáneamente").
 * Sin jsdom en este repo (ver CLAUDE.md / patrón establecido en
 * RegisterForm.test.tsx), un click real no se puede simular: las
 * aserciones de orden de invocación (A) usan inspección estática del
 * código fuente, igual que RegisterForm.test.tsx/RoleOnboardingForm.test.tsx.
 * Las aserciones puramente estructurales (qué se renderiza según props)
 * usan renderToStaticMarkup normalmente.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/jobs", () => ({
  completeJob: vi.fn(),
  cancelJob: vi.fn(),
}));

describe("JobActions — estructura según jobStatus (Fase 4 / C4-G14)", () => {
  it("F) jobStatus='completado' no renderiza ningún botón de acción (comportamiento previo, sin cambios)", () => {
    const html = renderToStaticMarkup(<JobActions jobId="job-1" jobStatus="completado" />);
    expect(html).toBe("");
  });

  it("jobStatus='en_progreso' muestra 'Marcar como completado'", () => {
    const html = renderToStaticMarkup(<JobActions jobId="job-1" jobStatus="en_progreso" />);
    expect(html).toContain("Marcar como completado");
  });

  it("jobStatus='abierto' muestra 'Cancelar trabajo' y no 'Marcar como completado'", () => {
    const html = renderToStaticMarkup(<JobActions jobId="job-1" jobStatus="abierto" />);
    expect(html).toContain("Cancelar trabajo");
    expect(html).not.toContain("Marcar como completado");
  });

  it("G) el flujo de calificación del worker (RatingForm en la página) es ajeno a este componente — JobActions no menciona rating/calificar en ningún estado", () => {
    const htmlEnProgreso = renderToStaticMarkup(<JobActions jobId="job-1" jobStatus="en_progreso" />);
    const htmlAbierto = renderToStaticMarkup(<JobActions jobId="job-1" jobStatus="abierto" />);
    expect(htmlEnProgreso.toLowerCase()).not.toContain("calificar");
    expect(htmlAbierto.toLowerCase()).not.toContain("calificar");
  });
});

describe("JobActions — código fuente de handleComplete/handleCancel (Fase 4 / C4-G14, sin jsdom)", () => {
  const source = readFileSync(new URL("./JobActions.tsx", import.meta.url), "utf-8");

  it("A) handleComplete() invoca completeJob(jobId)", () => {
    expect(source).toMatch(/const result = await completeJob\(jobId\);/);
  });

  it("B) router.refresh() se llama dentro de handleComplete(), después del toast de éxito y no antes", () => {
    const fnMatch = source.match(/function handleComplete\(\)[\s\S]*?\n  \}/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    const toastIdx = fnBody.indexOf('toast("Trabajo marcado como completado"');
    const refreshIdx = fnBody.indexOf("router.refresh()");
    expect(toastIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(toastIdx);
  });

  it("C) el camino de error de completeJob() hace return antes de llegar al toast de éxito o a router.refresh()", () => {
    const fnMatch = source.match(/function handleComplete\(\)[\s\S]*?\n  \}/);
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/if \(result\.error\) \{\s*toast\(result\.error, "error"\);\s*return;\s*\}/);
  });

  it("D) router.refresh() aparece exactamente una vez en todo el archivo (no se agregó a handleCancel, fuera de scope de esta fase)", () => {
    const matches = source.match(/router\.refresh\(\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("E) handleCancel() no fue modificado: sigue sin llamar a router.refresh()", () => {
    const fnMatch = source.match(/function handleCancel\(\)[\s\S]*?\n  \}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toContain("router.refresh()");
  });
});
