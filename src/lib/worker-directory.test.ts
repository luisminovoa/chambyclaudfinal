import { describe, expect, it } from "vitest";
import {
  parseWorkerDirectorySearchParams,
  escapePostgrestFilterValue,
  expandCategoryAliases,
} from "@/lib/worker-directory";

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

describe("escapePostgrestFilterValue", () => {
  it("1) envuelve un valor simple entre comillas dobles, sin alterar el contenido", () => {
    expect(escapePostgrestFilterValue("Juan")).toBe('"Juan"');
  });

  it("2) un valor con espacios se envuelve intacto", () => {
    expect(escapePostgrestFilterValue("Juan Pérez")).toBe('"Juan Pérez"');
  });

  it("3) una coma queda dentro de las comillas, no se convierte en separador", () => {
    expect(escapePostgrestFilterValue("Juan, electricista")).toBe('"Juan, electricista"');
  });

  it("4) paréntesis quedan dentro de las comillas, no alteran agrupación", () => {
    expect(escapePostgrestFilterValue("Juan (Chiclayo)")).toBe('"Juan (Chiclayo)"');
  });

  it("5) una comilla doble literal se escapa con backslash", () => {
    expect(escapePostgrestFilterValue('Juan "El Rayo"')).toBe('"Juan \\"El Rayo\\""');
  });

  it("un backslash literal se escapa a sí mismo antes de escapar comillas", () => {
    expect(escapePostgrestFilterValue("Juan\\Pérez")).toBe('"Juan\\\\Pérez"');
  });

  it("coma + paréntesis + comilla combinados siguen produciendo un único valor válido", () => {
    const input = 'electricista, "urgente" (Chiclayo)';
    const result = escapePostgrestFilterValue(input);
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // El único carácter " sin escapar debe ser el de apertura/cierre —
    // cualquier " interna del valor original debe llevar \ delante.
    const inner = result.slice(1, -1);
    expect(inner).not.toMatch(/(?<!\\)"/);
  });

  it("string vacía se envuelve en un par de comillas vacío", () => {
    expect(escapePostgrestFilterValue("")).toBe('""');
  });
});

describe("expandCategoryAliases", () => {
  it("Gasfitero expande a [Gasfitero, Plomero]", () => {
    expect(expandCategoryAliases("Gasfitero")).toEqual(["Gasfitero", "Plomero"]);
  });

  it("Niñera expande a [Niñera, Niñera / Cuidador]", () => {
    expect(expandCategoryAliases("Niñera")).toEqual(["Niñera", "Niñera / Cuidador"]);
  });

  it("Cocinero/a expande a [Cocinero/a, Cocinero]", () => {
    expect(expandCategoryAliases("Cocinero/a")).toEqual(["Cocinero/a", "Cocinero"]);
  });

  it("Chofer expande a [Chofer, Conductor]", () => {
    expect(expandCategoryAliases("Chofer")).toEqual(["Chofer", "Conductor"]);
  });

  it("una categoría sin alias conocido devuelve solo ella misma (p.ej. Electricista)", () => {
    expect(expandCategoryAliases("Electricista")).toEqual(["Electricista"]);
  });

  it("las demás categorías del Home sin alias conocido no se ven afectadas (Albañil, Carpintero, Pintor, Jardinero, Limpieza, Seguridad, Otro)", () => {
    for (const c of ["Albañil", "Carpintero", "Pintor", "Jardinero", "Limpieza", "Seguridad", "Otro"]) {
      expect(expandCategoryAliases(c)).toEqual([c]);
    }
  });

  it("un valor arbitrario no listado nunca arrastra alias de otra categoría", () => {
    expect(expandCategoryAliases("Plomero")).toEqual(["Plomero"]);
  });
});

describe("expandCategoryAliases — Catálogo V2 (C1: Logística y almacén / Almacenero)", () => {
  it("F) 'Logística y almacén' expande a ['Logística y almacén', 'Almacenero']", () => {
    expect(expandCategoryAliases("Logística y almacén")).toEqual([
      "Logística y almacén",
      "Almacenero",
    ]);
  });

  it("G) 'Almacenero' NUNCA se convierte en clave canónica — sigue devolviendo solo ['Almacenero']", () => {
    expect(expandCategoryAliases("Almacenero")).toEqual(["Almacenero"]);
  });

  it("H) los 4 aliases anteriores siguen funcionando exactamente igual tras agregar el quinto", () => {
    expect(expandCategoryAliases("Gasfitero")).toEqual(["Gasfitero", "Plomero"]);
    expect(expandCategoryAliases("Niñera")).toEqual(["Niñera", "Niñera / Cuidador"]);
    expect(expandCategoryAliases("Cocinero/a")).toEqual(["Cocinero/a", "Cocinero"]);
    expect(expandCategoryAliases("Chofer")).toEqual(["Chofer", "Conductor"]);
  });

  it("I) 'Administrativo' (categoría nueva sin alias) no se contamina con ningún otro alias", () => {
    expect(expandCategoryAliases("Administrativo")).toEqual(["Administrativo"]);
  });

  it("I) el alias de 'Logística y almacén' no se filtra hacia categorías sin relación", () => {
    for (const c of ["Electricista", "Seguridad", "Otro"]) {
      expect(expandCategoryAliases(c)).toEqual([c]);
    }
  });
});
