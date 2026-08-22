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
