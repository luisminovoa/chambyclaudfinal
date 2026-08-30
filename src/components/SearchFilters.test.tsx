import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchFilters } from "./SearchFilters";

// Mismo patrón que WorkerSearchFilters.test.tsx: evita depender del
// AppRouterContext real de Next.js en un render aislado con
// renderToStaticMarkup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/jobs",
  useSearchParams: () => new URLSearchParams(),
}));

describe("SearchFilters — filtros existentes (Fase 6, sin regresión)", () => {
  it("mantiene los campos existentes: palabra clave (q), ciudad (input libre) y categoría", () => {
    const html = renderToStaticMarkup(<SearchFilters categories={["Electricista"]} />);
    expect(html).toMatch(/<input id="filter-q"/);
    expect(html).toMatch(/<input id="filter-city"/);
    expect(html).toMatch(/<select id="filter-category"/);
  });
});

/**
 * Fase 6 (C4-G18) — ubicación jerárquica en la búsqueda de chambas
 * (/jobs). El filtro Ubigeo (LocationSelector) convive con el `city`
 * existente (input de texto libre, sin cambios) — nunca lo reemplaza.
 */
describe("SearchFilters — ubicación jerárquica (Fase 6 / C4-G18)", () => {
  it("renderiza los tres selects Departamento/Provincia/Distrito, además de los filtros existentes", () => {
    const html = renderToStaticMarkup(<SearchFilters categories={["Electricista"]} />);
    expect(html).toContain(">Departamento</label>");
    expect(html).toContain(">Provincia</label>");
    expect(html).toContain(">Distrito</label>");
    expect(html).toMatch(/<input id="filter-city"/);
  });

  it("provincia y distrito están deshabilitados por defecto (sin departamento seleccionado)", () => {
    const html = renderToStaticMarkup(<SearchFilters categories={["Electricista"]} />);
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain('disabled=""');
    expect(districtSelect).toContain('disabled=""');
  });

  it("provincia se habilita al reflejar un departamento ya presente en la URL", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => "/jobs",
      useSearchParams: () => new URLSearchParams("department=Lambayeque"),
    }));
    const { SearchFilters: SearchFiltersWithDepartment } = await import("./SearchFilters");
    const html = renderToStaticMarkup(<SearchFiltersWithDepartment categories={["Electricista"]} />);
    expect(html).toMatch(/<option[^>]*value="Lambayeque"[^>]*selected[^>]*>Lambayeque<\/option>/);
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).not.toContain('disabled=""');
  });

  it("/jobs?department=Lambayeque&province=Chiclayo&district=Cayaltí&city=Chiclayo queda reflejado y el botón Limpiar aparece", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => "/jobs",
      useSearchParams: () =>
        new URLSearchParams("department=Lambayeque&province=Chiclayo&district=Cayalt%C3%AD&city=Chiclayo"),
    }));
    const { SearchFilters: SearchFiltersWithLocation } = await import("./SearchFilters");
    const html = renderToStaticMarkup(<SearchFiltersWithLocation categories={["Electricista"]} />);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Cayaltí"[^>]*selected[^>]*>Cayaltí<\/option>/);
    expect(html).toMatch(/<input id="filter-city"[^>]*value="Chiclayo"/);
    expect(html).toContain("Limpiar");
  });
});
