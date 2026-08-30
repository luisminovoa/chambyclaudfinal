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

/**
 * Fase 6 (C4-G18) — ubicación jerárquica en el directorio de
 * trabajadores. El filtro Ubigeo (LocationSelector) convive con el
 * <select> de `city` (arriba, sin cambios) — nunca reemplaza `city` ni
 * usa CITY_NAMES como fuente.
 */
describe("WorkerSearchFilters — ubicación jerárquica (Fase 6 / C4-G18)", () => {
  it("renderiza los tres selects Departamento/Provincia/Distrito, además del select de Ciudad existente", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    expect(html).toContain(">Departamento</label>");
    expect(html).toContain(">Provincia</label>");
    expect(html).toContain(">Distrito</label>");
    // El select de ciudad legacy sigue existiendo, sin tocar.
    expect(html).toMatch(/<select id="worker-filter-city"/);
  });

  it("el catálogo de departamento NO viene de CITY_NAMES — incluye departamentos que nunca están en CITY_NAMES", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    for (const dep of ["Cusco", "Puno", "Loreto"]) {
      expect(CITY_NAMES).not.toContain(dep);
      expect(html).toContain(`>${dep}</option>`);
    }
  });

  it("provincia y distrito están deshabilitados por defecto (sin departamento seleccionado)", () => {
    const html = renderToStaticMarkup(<WorkerSearchFilters categories={["Electricista"]} />);
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain('disabled=""');
    expect(districtSelect).toContain('disabled=""');
  });

  it("/workers?department=Lambayeque&province=Chiclayo&district=Cayaltí queda reflejado como valor inicial de los tres selects", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => "/workers",
      useSearchParams: () => new URLSearchParams("department=Lambayeque&province=Chiclayo&district=Cayalt%C3%AD"),
    }));
    const { WorkerSearchFilters: WorkerSearchFiltersWithLocation } = await import("./WorkerSearchFilters");
    const html = renderToStaticMarkup(<WorkerSearchFiltersWithLocation categories={["Electricista"]} />);
    expect(html).toMatch(/<option[^>]*value="Lambayeque"[^>]*selected[^>]*>Lambayeque<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Cayaltí"[^>]*selected[^>]*>Cayaltí<\/option>/);
    expect(html).toContain("Limpiar");
  });
});
