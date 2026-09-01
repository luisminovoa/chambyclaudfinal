import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminJobRow } from "./AdminJobRow";
import type { Job } from "@/lib/types";

/**
 * P1 (auditoría post-V6): adminDeleteJob() ahora rechaza jobs
 * completado/cancelado (0048_protect_job_deletion.sql +
 * src/lib/actions/admin.ts) — el bypass admin de DELETE también quedó
 * restringido a estados no terminales. El botón "Eliminar" de la fila
 * admin no debe ofrecerse para esos dos estados; adminUpdateJobStatus()
 * (el <select> de cambio de estado) sigue disponible sin restricción,
 * sin cambios en esta fase.
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

vi.mock("@/lib/actions/admin", () => ({
  adminDeleteJob: vi.fn(),
  adminUpdateJobStatus: vi.fn(),
}));

function baseJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Electricista para local",
    city: "Lima",
    category: "Electricidad",
    status: "abierto",
    employer_id: "employer-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Job;
}

describe("AdminJobRow — botón Eliminar respeta jobs terminales (P1)", () => {
  it("abierto: el botón Eliminar aparece", () => {
    const html = renderToStaticMarkup(<AdminJobRow job={baseJob({ status: "abierto" })} />);
    expect(html).toContain("Eliminar");
    expect(html).not.toContain("No eliminable");
  });

  it("en_progreso: el botón Eliminar aparece", () => {
    const html = renderToStaticMarkup(<AdminJobRow job={baseJob({ status: "en_progreso" })} />);
    expect(html).toContain("Eliminar");
    expect(html).not.toContain("No eliminable");
  });

  it("completado: el botón Eliminar NO aparece, se muestra 'No eliminable'", () => {
    const html = renderToStaticMarkup(<AdminJobRow job={baseJob({ status: "completado" })} />);
    expect(html).not.toMatch(/<button[^>]*aria-label="Eliminar/);
    expect(html).toContain("No eliminable");
  });

  it("cancelado: el botón Eliminar NO aparece, se muestra 'No eliminable'", () => {
    const html = renderToStaticMarkup(<AdminJobRow job={baseJob({ status: "cancelado" })} />);
    expect(html).not.toMatch(/<button[^>]*aria-label="Eliminar/);
    expect(html).toContain("No eliminable");
  });

  it("el <select> de cambio de estado sigue disponible sin restricción, incluso para un job completado", () => {
    const html = renderToStaticMarkup(<AdminJobRow job={baseJob({ status: "completado" })} />);
    expect(html).toMatch(/<select/);
    expect(html).toContain("Completado");
  });
});
