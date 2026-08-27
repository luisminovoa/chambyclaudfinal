import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkerSearchFilters } from "./WorkerSearchFilters";
import { CITY_NAMES } from "@/lib/cities";

// Mismo patrón que page.test.tsx: evita depender del AppRouterContext real
// de Next.js en un render aislado con renderToStaticMarkup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/workers",
  useSearchParams: () => new URLSearchParams(),
}));

describe("WorkerSearchFilters — catálogo canónico de ciudad (Fase C4-C)", () => {
  it("A) el campo ciudad renderiza como <select>, no como <input> de texto libre", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    expect(html).toMatch(/<select id="worker-filter-city"/);
    expect(html).not.toMatch(/<input id="worker-filter-city"/);
  });

  it("B) las opciones son 'Todas las ciudades' seguidas de CITY_NAMES", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    expect(html).toContain('<option value="" selected="">Todas las ciudades</option>');
    for (const name of CITY_NAMES) {
      expect(html).toContain(`>${name}</option>`);
    }
  });

  it("C) las opciones de ciudad provienen de CITY_NAMES (cities.ts), no de una lista local", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    const selectMatch = html.match(/<select id="worker-filter-city"[^>]*>(.*?)<\/select>/s);
    expect(selectMatch).not.toBeNull();
    const optionValues = [...selectMatch![1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    expect(optionValues).toEqual(["", ...CITY_NAMES]);
  });

  it("D) el parámetro sigue siendo 'city' — el <select> mantiene id=\"worker-filter-city\" y el label 'Ciudad'", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    expect(html).toContain('<label for="worker-filter-city" class="label">');
    expect(html).toContain("Ciudad");
  });

  it("E) /workers?city=Chiclayo sigue siendo válido: el valor inicial del <select> refleja el searchParam city", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => "/workers",
      useSearchParams: () => new URLSearchParams("city=Chiclayo"),
    }));
    const { WorkerSearchFilters: WorkerSearchFiltersWithCity } = await import(
      "./WorkerSearchFilters"
    );
    const html = renderToStaticMarkup(
      <WorkerSearchFiltersWithCity categories={["Electricista"]} />
    );
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
  });

  it("F) el botón 'Limpiar' sigue apareciendo cuando hay un filtro de ciudad activo", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => "/workers",
      useSearchParams: () => new URLSearchParams("city=Trujillo"),
    }));
    const { WorkerSearchFilters: WorkerSearchFiltersWithCity } = await import(
      "./WorkerSearchFilters"
    );
    const html = renderToStaticMarkup(
      <WorkerSearchFiltersWithCity categories={["Electricista"]} />
    );
    expect(html).toContain("Limpiar");
  });
});
