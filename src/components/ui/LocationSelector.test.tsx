import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationSelector } from "./LocationSelector";

describe("LocationSelector — Departamento → Provincia → Distrito (Fase 1 ubicación)", () => {
  it("A) renderiza tres <select> con sus labels: Departamento, Provincia, Distrito", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="" province="" district="" onChange={vi.fn()} />
    );
    expect(html).toContain(">Departamento</label>");
    expect(html).toContain(">Provincia</label>");
    expect(html).toContain(">Distrito</label>");
    expect((html.match(/<select/g) ?? []).length).toBe(3);
  });

  it("B) el departamento incluye los 24 departamentos de Perú, sin limitarse a Chiclayo/Trujillo", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="" province="" district="" onChange={vi.fn()} />
    );
    for (const dep of ["Lambayeque", "La Libertad", "Lima", "Cusco", "Puno", "Loreto", "Tacna"]) {
      expect(html).toContain(`>${dep}</option>`);
    }
  });

  it("C) provincia está deshabilitada cuando no hay departamento seleccionado", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="" province="" district="" onChange={vi.fn()} />
    );
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>/)?.[0] ?? "";
    expect(provinceSelect).toContain("disabled=\"\"");
    expect(html).toContain("Primero elige un departamento");
  });

  it("D) provincia se habilita y se llena al elegir un departamento", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="Lambayeque" province="" district="" onChange={vi.fn()} />
    );
    const provinceSelect = html.match(/<select[^>]*name="province"[^>]*>(.*?)<\/select>/s);
    expect(provinceSelect).not.toBeNull();
    expect(provinceSelect![0]).not.toContain("disabled=\"\"");
    expect(provinceSelect![1]).toContain(">Chiclayo</option>");
    expect(provinceSelect![1]).toContain(">Ferreñafe</option>");
  });

  it("E) distrito está deshabilitado si hay departamento pero no provincia", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="Lambayeque" province="" district="" onChange={vi.fn()} />
    );
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>/)?.[0] ?? "";
    expect(districtSelect).toContain("disabled=\"\"");
    expect(html).toContain("Primero elige una provincia");
  });

  it("F) distrito se habilita y se llena al elegir departamento + provincia", () => {
    const html = renderToStaticMarkup(
      <LocationSelector department="Lambayeque" province="Chiclayo" district="" onChange={vi.fn()} />
    );
    const districtSelect = html.match(/<select[^>]*name="district"[^>]*>(.*?)<\/select>/s);
    expect(districtSelect).not.toBeNull();
    expect(districtSelect![0]).not.toContain("disabled=\"\"");
    expect(districtSelect![1]).toContain(">Chiclayo</option>");
    expect(districtSelect![1]).toContain(">Pimentel</option>");
  });

  it("G) valores iniciales quedan seleccionados (caso de edición de un perfil/trabajo existente)", () => {
    const html = renderToStaticMarkup(
      <LocationSelector
        department="Lambayeque"
        province="Chiclayo"
        district="Pimentel"
        onChange={vi.fn()}
      />
    );
    expect(html).toMatch(/<option[^>]*value="Lambayeque"[^>]*selected[^>]*>Lambayeque<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Chiclayo"[^>]*selected[^>]*>Chiclayo<\/option>/);
    expect(html).toMatch(/<option[^>]*value="Pimentel"[^>]*selected[^>]*>Pimentel<\/option>/);
  });

  it("H) muestra errores de validación bajo el campo correspondiente", () => {
    const html = renderToStaticMarkup(
      <LocationSelector
        department=""
        province=""
        district=""
        onChange={vi.fn()}
        errors={{ department: "Selecciona un departamento" }}
      />
    );
    expect(html).toContain("Selecciona un departamento");
    expect(html).toMatch(/aria-invalid="true"/);
  });

  it("I) disabled=true fuerza los tres <select> a deshabilitados", () => {
    const html = renderToStaticMarkup(
      <LocationSelector
        department="Lambayeque"
        province="Chiclayo"
        district="Pimentel"
        onChange={vi.fn()}
        disabled
      />
    );
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
  });

  it("J) idPrefix evita colisión de ids entre dos instancias en la misma página", () => {
    const htmlA = renderToStaticMarkup(
      <LocationSelector
        department=""
        province=""
        district=""
        onChange={vi.fn()}
        idPrefix="job-location"
      />
    );
    const htmlB = renderToStaticMarkup(
      <LocationSelector
        department=""
        province=""
        district=""
        onChange={vi.fn()}
        idPrefix="profile-location"
      />
    );
    const idsA = [...htmlA.matchAll(/(?<![a-zA-Z-])id="([^"]+)"/g)].map((m) => m[1]);
    const idsB = [...htmlB.matchAll(/(?<![a-zA-Z-])id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of idsA) expect(idsB).not.toContain(id);
    expect(idsA.every((id) => id.startsWith("job-location-"))).toBe(true);
    expect(idsB.every((id) => id.startsWith("profile-location-"))).toBe(true);
  });
});
