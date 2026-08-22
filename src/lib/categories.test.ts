import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";

describe("categories.ts — fuente única de verdad del catálogo de ocupaciones", () => {
  it("3) CATEGORY_NAMES no contiene nombres duplicados", () => {
    const unique = new Set(CATEGORY_NAMES);
    expect(unique.size).toBe(CATEGORY_NAMES.length);
  });

  it("CATEGORY_NAMES se deriva de CATEGORIES (no es una lista escrita a mano por separado)", () => {
    expect(CATEGORY_NAMES).toEqual(CATEGORIES.map((c) => c.name));
  });

  it("ningún nombre de categoría queda vacío o solo espacios", () => {
    for (const name of CATEGORY_NAMES) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("categories.ts — Catálogo V2 (C1: Administrativo + Logística y almacén)", () => {
  it("A) CATEGORY_NAMES contiene exactamente las 14 categorías aprobadas, en el orden aprobado", () => {
    expect(CATEGORY_NAMES).toEqual([
      "Electricista",
      "Gasfitero",
      "Albañil",
      "Niñera",
      "Cocinero/a",
      "Jardinero",
      "Limpieza",
      "Carpintero",
      "Pintor",
      "Chofer",
      "Seguridad",
      "Administrativo",
      "Logística y almacén",
      "Otro",
    ]);
  });

  it("B) sin duplicados tras agregar las 2 categorías nuevas", () => {
    expect(new Set(CATEGORY_NAMES).size).toBe(14);
  });

  it("C) 'Otro' sigue siendo la última categoría", () => {
    expect(CATEGORY_NAMES[CATEGORY_NAMES.length - 1]).toBe("Otro");
  });

  it("D) 'Administrativo' aparece en CATEGORY_NAMES", () => {
    expect(CATEGORY_NAMES).toContain("Administrativo");
  });

  it("E) 'Logística y almacén' aparece en CATEGORY_NAMES", () => {
    expect(CATEGORY_NAMES).toContain("Logística y almacén");
  });

  it("las 12 categorías previas no cambiaron de nombre ni de posición relativa entre sí", () => {
    const previous = [
      "Electricista",
      "Gasfitero",
      "Albañil",
      "Niñera",
      "Cocinero/a",
      "Jardinero",
      "Limpieza",
      "Carpintero",
      "Pintor",
      "Chofer",
      "Seguridad",
    ];
    const indices = previous.map((name) => CATEGORY_NAMES.indexOf(name));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    for (const i of indices) expect(i).toBeGreaterThanOrEqual(0);
  });
});
