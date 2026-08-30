import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobCard } from "./JobCard";
import type { JobWithEmployer } from "@/lib/types";

// Mismo patrón que WorkerDirectoryCard.test.tsx: evita depender del
// AppRouterContext real de Next.js en un render aislado.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// JobCardActions usa useRouter() de next/navigation — sin AppRouterContext
// montado, se hace stub mínimo solo para que renderice (mismo patrón que
// page.test.tsx del Home).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseJob: JobWithEmployer = {
  id: "job-1",
  employer_id: "employer-1",
  title: "Electricista para instalación",
  description: "Se busca electricista con experiencia.",
  category: "Electricista",
  city: "Chiclayo",
  department: null,
  province: null,
  district: null,
  address: null,
  pay_amount: 100,
  pay_type: "por_dia",
  status: "abierto",
  positions_needed: 1,
  assigned_worker_id: null,
  starts_at: null,
  hired_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  employer: { id: "employer-1", full_name: "Jose Ramirez", avatar_url: null, city: "Chiclayo" },
};

/**
 * Fase 6 (C4-G18) — JobCard debe usar formatLocation(job), no job.city
 * directamente, manteniendo intactos título, categoría (implícita vía
 * badge de estado) y CTA.
 */
describe("JobCard — ubicación jerárquica (Fase 6 / C4-G18)", () => {
  it("full: Ubigeo completo muestra 'Distrito, Provincia, Departamento'", () => {
    const job: JobWithEmployer = {
      ...baseJob,
      department: "Lambayeque",
      province: "Chiclayo",
      district: "Cayaltí",
    };
    const html = renderToStaticMarkup(<JobCard job={job} currentUserId={null} viewerRole={null} />);
    expect(html).toContain("Cayaltí, Chiclayo, Lambayeque");
  });

  it("legacy: sin Ubigeo, cae a city tal cual (baseJob.city = 'Chiclayo')", () => {
    const html = renderToStaticMarkup(<JobCard job={baseJob} currentUserId={null} viewerRole={null} />);
    expect(html).toContain("Chiclayo");
  });

  it("no location: sin Ubigeo ni city no renderiza null/undefined", () => {
    const job: JobWithEmployer = { ...baseJob, city: null as unknown as string };
    const html = renderToStaticMarkup(<JobCard job={job} currentUserId={null} viewerRole={null} />);
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
  });

  it("no se rompe el resto de la tarjeta: título, pago y CTA siguen presentes", () => {
    const html = renderToStaticMarkup(<JobCard job={baseJob} currentUserId={null} viewerRole={null} />);
    expect(html).toContain("Electricista para instalación");
    expect(html).toContain("S/");
    expect(html).toMatch(/<a href="\/jobs\/job-1"/);
  });
});
