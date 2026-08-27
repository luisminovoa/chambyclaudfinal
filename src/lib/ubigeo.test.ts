import { describe, expect, it } from "vitest";
import {
  getDepartments,
  getProvinces,
  getDistricts,
  isValidDepartment,
  isValidProvince,
  isValidDistrict,
  isValidLocation,
  validateLocationInput,
} from "@/lib/ubigeo";

describe("ubigeo.ts — catálogo Ubigeo Perú (Fase 1 ubicación jerárquica)", () => {
  it("A) getDepartments() cubre los 24 departamentos de Perú", () => {
    expect(getDepartments()).toHaveLength(24);
    expect(getDepartments()).toContain("Lambayeque");
    expect(getDepartments()).toContain("La Libertad");
    expect(getDepartments()).toContain("Lima");
    expect(getDepartments()).toContain("Cusco");
  });

  it("B) no hay departamentos duplicados", () => {
    const deps = getDepartments();
    expect(new Set(deps).size).toBe(deps.length);
  });

  it("C) getProvinces() depende del departamento indicado", () => {
    expect(getProvinces("Lambayeque")).toEqual(["Chiclayo", "Ferreñafe", "Lambayeque"]);
    expect(getProvinces("Lambayeque")).not.toEqual(getProvinces("La Libertad"));
  });

  it("D) getProvinces() de un departamento inexistente/vacío devuelve []", () => {
    expect(getProvinces("Narnia")).toEqual([]);
    expect(getProvinces(null)).toEqual([]);
    expect(getProvinces(undefined)).toEqual([]);
    expect(getProvinces("")).toEqual([]);
  });

  it("E) getDistricts() depende de departamento + provincia", () => {
    const chiclayoDistricts = getDistricts("Lambayeque", "Chiclayo");
    expect(chiclayoDistricts).toContain("Chiclayo");
    expect(chiclayoDistricts.length).toBeGreaterThan(1);
    expect(getDistricts("Lambayeque", "Ferreñafe")).not.toEqual(chiclayoDistricts);
  });

  it("F) getDistricts() de una combinación inválida devuelve []", () => {
    expect(getDistricts("Lambayeque", "Provincia Inexistente")).toEqual([]);
    expect(getDistricts("Departamento Inexistente", "Chiclayo")).toEqual([]);
    expect(getDistricts(null, "Chiclayo")).toEqual([]);
    expect(getDistricts("Lambayeque", null)).toEqual([]);
  });

  it("G) el fix de ñ se aplicó correctamente (no quedan nombres corrompidos con 'q' suelta)", () => {
    expect(getProvinces("Lambayeque")).toContain("Ferreñafe");
    expect(getDistricts("Lambayeque", "Ferreñafe")).toContain("Cañaris");
    expect(getDistricts("Cajamarca", "Cajamarca")).toContain("Encañada");
  });

  it("H) la excepción real 'Wanchaq' (distrito de Cusco) no fue alterada por el fix de ñ", () => {
    expect(getDistricts("Cusco", "Cusco")).toContain("Wanchaq");
  });

  it("I) isValidDepartment()", () => {
    expect(isValidDepartment("Lambayeque")).toBe(true);
    expect(isValidDepartment("Narnia")).toBe(false);
  });

  it("J) isValidProvince() exige pertenencia real al departamento", () => {
    expect(isValidProvince("Lambayeque", "Chiclayo")).toBe(true);
    expect(isValidProvince("La Libertad", "Chiclayo")).toBe(false);
  });

  it("K) isValidDistrict() exige pertenencia real a la provincia", () => {
    expect(isValidDistrict("Lambayeque", "Chiclayo", "Pimentel")).toBe(true);
    expect(isValidDistrict("Lambayeque", "Ferreñafe", "Pimentel")).toBe(false);
  });

  it("L) isValidLocation() valida la jerarquía completa", () => {
    expect(isValidLocation("Lambayeque", "Chiclayo", "Chiclayo")).toBe(true);
    expect(isValidLocation("Lambayeque", "Chiclayo", "Trujillo")).toBe(false);
    expect(isValidLocation("Lambayeque", "Trujillo", "Trujillo")).toBe(false);
    expect(isValidLocation("Narnia", "Chiclayo", "Chiclayo")).toBe(false);
  });

  it("M) Callao aparece como provincia de Lima (así lo modela la fuente del dataset)", () => {
    expect(getProvinces("Lima")).toContain("Callao");
  });
});

describe("validateLocationInput() — validación server-side reutilizable (Server Actions)", () => {
  it("A) jerarquía completa y válida se acepta y se normaliza (trim)", () => {
    const result = validateLocationInput({
      department: " Lambayeque ",
      province: " Chiclayo ",
      district: " Pimentel ",
    });
    expect(result).toEqual({ department: "Lambayeque", province: "Chiclayo", district: "Pimentel" });
  });

  it("B) los tres campos vacíos/ausentes se normalizan a null sin error (guardado progresivo)", () => {
    expect(validateLocationInput({})).toEqual({ department: null, province: null, district: null });
    expect(validateLocationInput({ department: "", province: "", district: "" })).toEqual({
      department: null,
      province: null,
      district: null,
    });
  });

  it("C) solo departamento (sin provincia/distrito todavía) es válido", () => {
    expect(validateLocationInput({ department: "Lambayeque" })).toEqual({
      department: "Lambayeque",
      province: null,
      district: null,
    });
  });

  it("D) departamento inválido se rechaza", () => {
    const result = validateLocationInput({ department: "Narnia" });
    expect(result).toHaveProperty("error");
  });

  it("E) provincia sin departamento se rechaza", () => {
    const result = validateLocationInput({ province: "Chiclayo" });
    expect(result).toHaveProperty("error");
  });

  it("F) provincia que no pertenece al departamento se rechaza (evita bypass del cliente)", () => {
    const result = validateLocationInput({ department: "La Libertad", province: "Chiclayo" });
    expect(result).toHaveProperty("error");
  });

  it("G) distrito sin provincia se rechaza", () => {
    const result = validateLocationInput({ department: "Lambayeque", district: "Chiclayo" });
    expect(result).toHaveProperty("error");
  });

  it("H) distrito que no pertenece a la provincia se rechaza", () => {
    const result = validateLocationInput({
      department: "Lambayeque",
      province: "Ferreñafe",
      district: "Pimentel",
    });
    expect(result).toHaveProperty("error");
  });
});
