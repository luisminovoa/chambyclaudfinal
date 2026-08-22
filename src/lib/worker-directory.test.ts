import { describe, expect, it } from "vitest";
import { parseWorkerDirectorySearchParams } from "@/lib/worker-directory";

describe("parseWorkerDirectorySearchParams", () => {
  it("5. normaliza category presente", () => {
    expect(parseWorkerDirectorySearchParams({ category: "Electricista" })).toMatchObject({
      category: "Electricista",
    });
  });

  it("category ausente/vacía se vuelve undefined, nunca string vacío", () => {
    expect(parseWorkerDirectorySearchParams({ category: "" }).category).toBeUndefined();
    expect(parseWorkerDirectorySearchParams({}).category).toBeUndefined();
  });

  it("6. normaliza city presente y le hace trim", () => {
    expect(parseWorkerDirectorySearchParams({ city: "  Chiclayo  " }).city).toBe("Chiclayo");
  });

  it("7. normaliza q (búsqueda) presente y le hace trim", () => {
    expect(parseWorkerDirectorySearchParams({ q: "  electricista  " }).q).toBe("electricista");
  });

  it("q vacía o solo espacios se vuelve undefined", () => {
    expect(parseWorkerDirectorySearchParams({ q: "   " }).q).toBeUndefined();
  });

  it("acepta un valor de availability válido del enum", () => {
    expect(parseWorkerDirectorySearchParams({ availability: "inmediata" }).availability).toBe(
      "inmediata"
    );
  });

  it("descarta un valor de availability fuera del enum (no llega nunca a la query)", () => {
    expect(
      parseWorkerDirectorySearchParams({ availability: "mañana-tal-vez" }).availability
    ).toBeUndefined();
  });

  it("descarta availability ausente", () => {
    expect(parseWorkerDirectorySearchParams({}).availability).toBeUndefined();
  });

  it("combina los 4 filtros a la vez sin interferir entre sí", () => {
    expect(
      parseWorkerDirectorySearchParams({
        category: "Electricista",
        city: "Lima",
        availability: "una_semana",
        q: "residencial",
      })
    ).toEqual({
      category: "Electricista",
      city: "Lima",
      availability: "una_semana",
      q: "residencial",
    });
  });

  it("sin ningún searchParam, todos los filtros quedan undefined", () => {
    expect(parseWorkerDirectorySearchParams({})).toEqual({
      category: undefined,
      city: undefined,
      availability: undefined,
      q: undefined,
    });
  });
});
