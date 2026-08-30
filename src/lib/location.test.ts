import { describe, expect, it } from "vitest";
import { formatLocation } from "./location";

/**
 * formatLocation() — Fase 6 (C4-G18), única fuente de presentación de
 * ubicación jerárquica en toda la app (búsqueda de trabajadores/chambas,
 * resultados, perfiles públicos, detalle de trabajo). Cubre exactamente
 * los 9 escenarios exigidos por la auditoría de adopción de Ubigeo en
 * descubrimiento.
 */
describe("formatLocation", () => {
  it("1) Ubigeo completo: department + province + district → 'Distrito, Provincia, Departamento'", () => {
    expect(
      formatLocation({ department: "Lambayeque", province: "Chiclayo", district: "Cayaltí" })
    ).toBe("Cayaltí, Chiclayo, Lambayeque");
  });

  it("2) district + province (sin department) → 'Distrito, Provincia'", () => {
    expect(formatLocation({ department: null, province: "Chiclayo", district: "Cayaltí" })).toBe(
      "Cayaltí, Chiclayo"
    );
  });

  it("3) province + department (sin district) → 'Provincia, Departamento'", () => {
    expect(formatLocation({ department: "Lambayeque", province: "Chiclayo", district: null })).toBe(
      "Chiclayo, Lambayeque"
    );
  });

  it("4) solo department → 'Departamento'", () => {
    expect(formatLocation({ department: "Lambayeque", province: null, district: null })).toBe(
      "Lambayeque"
    );
  });

  it("5) city legacy (sin ningún nivel de Ubigeo) → city tal cual", () => {
    expect(
      formatLocation({ department: null, province: null, district: null, city: "Chiclayo" })
    ).toBe("Chiclayo");
  });

  it("6) ninguno (ni Ubigeo ni city) → null", () => {
    expect(formatLocation({ department: null, province: null, district: null, city: null })).toBeNull();
    expect(formatLocation({})).toBeNull();
  });

  it("7) combinación parcial (department + district, sin province) no inventa el nivel faltante", () => {
    expect(formatLocation({ department: "Lambayeque", province: null, district: "Cayaltí" })).toBe(
      "Cayaltí, Lambayeque"
    );
  });

  it("8) strings vacíos o solo espacios se tratan como ausentes, igual que null", () => {
    expect(
      formatLocation({ department: "  ", province: "", district: "   ", city: "Chiclayo" })
    ).toBe("Chiclayo");
    expect(formatLocation({ department: "Lambayeque  ", province: " ", district: "" })).toBe(
      "Lambayeque"
    );
  });

  it("9) no inferencia: city='Chiclayo' sin Ubigeo nunca produce 'Lambayeque' ni ningún otro departamento inventado", () => {
    const result = formatLocation({ department: null, province: null, district: null, city: "Chiclayo" });
    expect(result).toBe("Chiclayo");
    expect(result).not.toBe("Lambayeque");
  });

  it("con Ubigeo presente, city se ignora por completo (el Ubigeo siempre manda, nunca se combinan)", () => {
    expect(
      formatLocation({ department: "Lambayeque", province: null, district: null, city: "Trujillo" })
    ).toBe("Lambayeque");
  });
});
