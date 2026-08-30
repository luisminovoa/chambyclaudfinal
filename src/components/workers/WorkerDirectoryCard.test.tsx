import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkerDirectoryCard } from "./WorkerDirectoryCard";
import type { PublicWorkerListing } from "@/lib/types";

// Mismo patrón que page.test.tsx/RegisterForm.test.tsx: evita depender del
// AppRouterContext real de Next.js en un render aislado con
// renderToStaticMarkup.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseWorker: PublicWorkerListing = {
  id: "w-1",
  full_name: "Ana Ramírez",
  avatar_url: null,
  city: "Chiclayo",
  category: "Electricista",
  skills: [],
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
  professional_title: "Electricista industrial",
  availability: "inmediata",
  years_experience: 5,
  hourly_rate: 30,
  daily_rate: null,
  department: null,
  province: null,
  district: null,
  ratingSummary: { profile_id: "w-1", average_score: 4.8, total_ratings: 12 },
  jobsCompleted: 0,
};

describe("WorkerDirectoryCard — jobsCompleted (Fase C4-G3)", () => {
  it("A) jobsCompleted = 8 muestra '8 trabajos'", () => {
    const html = renderToStaticMarkup(
      <WorkerDirectoryCard worker={{ ...baseWorker, jobsCompleted: 8 }} />
    );
    expect(html).toContain("8 trabajos");
  });

  it("B) jobsCompleted = 1 muestra '1 trabajo' en singular", () => {
    const html = renderToStaticMarkup(
      <WorkerDirectoryCard worker={{ ...baseWorker, jobsCompleted: 1 }} />
    );
    expect(html).toContain("1 trabajo");
    expect(html).not.toContain("1 trabajos");
  });

  it("C) jobsCompleted = 0 no muestra ninguna métrica de trabajos completados", () => {
    const html = renderToStaticMarkup(
      <WorkerDirectoryCard worker={{ ...baseWorker, jobsCompleted: 0 }} />
    );
    expect(html).not.toContain("trabajos");
    expect(html).not.toContain("0 trabajo");
  });
});

describe("WorkerDirectoryCard — deduplicación de categoría (Fase C4-G3)", () => {
  it("J) primaryTitle === category (sin professional_title) no muestra el Badge de categoría duplicado", () => {
    const worker: PublicWorkerListing = {
      ...baseWorker,
      professional_title: null,
      category: "Electricista",
    };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    // "Electricista" debe aparecer como título (primaryTitle), pero no
    // además como Badge — se cuenta cuántas veces aparece el texto exacto.
    const occurrences = html.split("Electricista").length - 1;
    expect(occurrences).toBe(1);
  });

  it("K) professional_title distinto de category conserva el Badge (información adicional real)", () => {
    const worker: PublicWorkerListing = {
      ...baseWorker,
      professional_title: "Electricista industrial certificado",
      category: "Electricista",
    };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    expect(html).toContain("Electricista industrial certificado");
    expect(html).toContain(">Electricista<");
  });

  it("sin category, nunca se muestra ningún Badge de categoría (único Badge tone=\"primary\" del componente)", () => {
    const worker: PublicWorkerListing = { ...baseWorker, category: null };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    // El único <Badge tone="primary"> de este componente es el de category
    // — sin category, esa clase no debería aparecer en absoluto.
    expect(html).not.toContain("bg-primary-50 text-primary-700");
  });
});

describe("WorkerDirectoryCard — CTA y campos ausentes (Fase C4-G3)", () => {
  it("L) la tarjeta completa sigue enlazando a /workers/[id]", () => {
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={baseWorker} />);
    expect(html).toMatch(/<a href="\/workers\/w-1"/);
    expect(html).toContain("Ver perfil");
  });

  it("M) ausencia de todos los campos opcionales no produce undefined/null/NaN visibles", () => {
    const worker: PublicWorkerListing = {
      id: "w-empty",
      full_name: "Sin Perfil",
      avatar_url: null,
      city: null,
      category: null,
      skills: [],
      bio: null,
      created_at: "2026-01-01T00:00:00Z",
      professional_title: null,
      availability: null,
      years_experience: null,
      hourly_rate: null,
      daily_rate: null,
      department: null,
      province: null,
      district: null,
      ratingSummary: null,
      jobsCompleted: 0,
    };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(html).not.toContain("NaN");
    expect(html).toContain("Sin calificaciones aún");
  });
});

/**
 * Fase 6 (C4-G18) — WorkerDirectoryCard debe usar formatLocation(worker),
 * no worker.city directamente, cuando existen niveles jerárquicos.
 */
describe("WorkerDirectoryCard — ubicación jerárquica (Fase 6 / C4-G18)", () => {
  it("full: Ubigeo completo muestra 'Distrito, Provincia, Departamento'", () => {
    const worker: PublicWorkerListing = {
      ...baseWorker,
      department: "Lambayeque",
      province: "Chiclayo",
      district: "Cayaltí",
    };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    expect(html).toContain("Cayaltí, Chiclayo, Lambayeque");
  });

  it("legacy: sin Ubigeo, cae a city tal cual (baseWorker.city = 'Chiclayo')", () => {
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={baseWorker} />);
    expect(html).toContain("Chiclayo");
  });

  it("empty: sin Ubigeo ni city, no muestra ninguna fila de ubicación", () => {
    const worker: PublicWorkerListing = { ...baseWorker, city: null, department: null, province: null, district: null };
    const html = renderToStaticMarkup(<WorkerDirectoryCard worker={worker} />);
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
  });
});
