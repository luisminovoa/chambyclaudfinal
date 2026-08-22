import { describe, expect, it } from "vitest";
import { CITIES, CITY_NAMES, normalizeCity } from "@/lib/cities";

describe("cities.ts — fuente única de verdad del catálogo de ciudades (Fase C4-C)", () => {
  it("A) el catálogo contiene exactamente Chiclayo y Trujillo", () => {
    expect(CITY_NAMES).toEqual(["Chiclayo", "Trujillo"]);
  });

  it("B) no existen ciudades duplicadas", () => {
    expect(new Set(CITY_NAMES).size).toBe(CITY_NAMES.length);
  });

  it("C) ninguna ciudad está vacía o son solo espacios", () => {
    for (const name of CITY_NAMES) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("D) CITY_NAMES se deriva de CITIES, no es una segunda lista escrita a mano", () => {
    expect(CITY_NAMES).toEqual([...CITIES]);
  });

  it("E) el orden es Chiclayo, Trujillo", () => {
    expect(CITY_NAMES[0]).toBe("Chiclayo");
    expect(CITY_NAMES[1]).toBe("Trujillo");
  });

  it("F) no contiene ciudades no aprobadas para el catálogo V1", () => {
    for (const notApproved of ["Lima", "Arequipa", "Piura", "Cusco", "Otra"]) {
      expect(CITY_NAMES).not.toContain(notApproved);
    }
  });
});

describe("normalizeCity() — compatibilidad con datos históricos (Fase C4-D)", () => {
  it("A) 'Chiclayo' (ya canónico) se devuelve tal cual", () => {
    expect(normalizeCity("Chiclayo")).toBe("Chiclayo");
  });

  it("B) 'CHICLAYO' (mayúsculas de Production) normaliza a 'Chiclayo'", () => {
    expect(normalizeCity("CHICLAYO")).toBe("Chiclayo");
  });

  it("C) ' chiclayo ' (minúsculas + espacios) normaliza a 'Chiclayo'", () => {
    expect(normalizeCity(" chiclayo ")).toBe("Chiclayo");
  });

  it("D) 'Trujillo' (ya canónico) se devuelve tal cual", () => {
    expect(normalizeCity("Trujillo")).toBe("Trujillo");
  });

  it("E) null devuelve null (nunca inventa una ciudad ni lanza)", () => {
    expect(normalizeCity(null)).toBeNull();
  });

  it("E) undefined también devuelve null", () => {
    expect(normalizeCity(undefined)).toBeNull();
  });

  it("E) cadena vacía o solo espacios devuelve null", () => {
    expect(normalizeCity("")).toBeNull();
    expect(normalizeCity("   ")).toBeNull();
  });

  it("F) un valor fuera del catálogo (p. ej. 'Lima') se conserva tal cual, nunca se convierte en Chiclayo/Trujillo", () => {
    expect(normalizeCity("Lima")).toBe("Lima");
    expect(normalizeCity("Bogotá")).toBe("Bogotá");
  });

  it("no depende de una tabla de alias separada: cualquier variante de mayúsculas de una ciudad del catálogo normaliza igual", () => {
    expect(normalizeCity("TRUJILLO")).toBe("Trujillo");
    expect(normalizeCity("trujillo")).toBe("Trujillo");
  });
});
