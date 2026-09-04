import { describe, expect, it } from "vitest";
import {
  parseWorkerDirectorySearchParams,
  escapePostgrestFilterValue,
  expandCategoryAliases,
  computeWorkerQualityScore,
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

  // ============================================================
  // Ubicación jerárquica (Fase 6, C4-G18) — mismo trim/undefined que
  // category/city/q, cada nivel es independiente de los demás.
  // ============================================================
  describe("ubicación jerárquica — department/province/district", () => {
    it("normaliza department presente y le hace trim", () => {
      expect(parseWorkerDirectorySearchParams({ department: "  Lambayeque  " }).department).toBe(
        "Lambayeque"
      );
    });

    it("normaliza province presente y le hace trim", () => {
      expect(parseWorkerDirectorySearchParams({ province: "  Chiclayo  " }).province).toBe("Chiclayo");
    });

    it("normaliza district presente y le hace trim", () => {
      expect(parseWorkerDirectorySearchParams({ district: "  Cayaltí  " }).district).toBe("Cayaltí");
    });

    it("department/province/district ausentes o solo espacios se vuelven undefined, nunca string vacío", () => {
      expect(parseWorkerDirectorySearchParams({}).department).toBeUndefined();
      expect(parseWorkerDirectorySearchParams({ province: "   " }).province).toBeUndefined();
      expect(parseWorkerDirectorySearchParams({ district: "" }).district).toBeUndefined();
    });

    it("combina los 7 filtros (los 4 anteriores + department/province/district) sin interferir entre sí, y convive con city", () => {
      expect(
        parseWorkerDirectorySearchParams({
          category: "Electricista",
          city: "Lima",
          availability: "una_semana",
          q: "residencial",
          department: "Lambayeque",
          province: "Chiclayo",
          district: "Cayaltí",
        })
      ).toEqual({
        category: "Electricista",
        city: "Lima",
        availability: "una_semana",
        q: "residencial",
        department: "Lambayeque",
        province: "Chiclayo",
        district: "Cayaltí",
      });
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

describe("computeWorkerQualityScore (Fase C3)", () => {
  const empty = {
    category: null,
    city: null,
    availability: null,
    professional_title: null,
    years_experience: null,
    hourly_rate: null,
    daily_rate: null,
    bio: null,
    skills: [] as string[],
  };

  it("A) worker completamente vacío puntúa 0", () => {
    expect(computeWorkerQualityScore(empty)).toBe(0);
  });

  it("B) solo category puntúa 30", () => {
    expect(computeWorkerQualityScore({ ...empty, category: "Electricista" })).toBe(30);
  });

  it("C) category + city puntúa 55 (30 + 25)", () => {
    expect(
      computeWorkerQualityScore({ ...empty, category: "Electricista", city: "Lima" })
    ).toBe(55);
  });

  it("D) category + city + availability puntúa 70 (30 + 25 + 15)", () => {
    expect(
      computeWorkerQualityScore({
        ...empty,
        category: "Electricista",
        city: "Lima",
        availability: "inmediata",
      })
    ).toBe(70);
  });

  it("E) perfil profesional completo puntúa 100", () => {
    expect(
      computeWorkerQualityScore({
        category: "Electricista",
        city: "Lima",
        availability: "inmediata",
        professional_title: "Electricista industrial",
        years_experience: 5,
        hourly_rate: 30,
        daily_rate: null,
        bio: "Electricista con experiencia",
        skills: ["Soldadura"],
      })
    ).toBe(100);
  });

  it("category pesa más que city, y city más que availability (orden de prioridad)", () => {
    expect(computeWorkerQualityScore({ ...empty, category: "Electricista" })).toBeGreaterThan(
      computeWorkerQualityScore({ ...empty, city: "Lima" })
    );
    expect(computeWorkerQualityScore({ ...empty, city: "Lima" })).toBeGreaterThan(
      computeWorkerQualityScore({ ...empty, availability: "inmediata" })
    );
  });

  it("category/city pesan más que experiencia o tarifa por separado", () => {
    const experienceOnly = computeWorkerQualityScore({ ...empty, years_experience: 20 });
    const rateOnly = computeWorkerQualityScore({ ...empty, hourly_rate: 100 });
    expect(computeWorkerQualityScore({ ...empty, category: "Electricista" })).toBeGreaterThan(
      experienceOnly
    );
    expect(computeWorkerQualityScore({ ...empty, city: "Lima" })).toBeGreaterThan(rateOnly);
  });

  it("daily_rate cuenta igual que hourly_rate (basta con que exista uno de los dos)", () => {
    expect(computeWorkerQualityScore({ ...empty, hourly_rate: 30 })).toBe(
      computeWorkerQualityScore({ ...empty, daily_rate: 100 })
    );
  });

  it("tener ambas tarifas a la vez no duplica los puntos (sigue siendo +5, no +10)", () => {
    expect(
      computeWorkerQualityScore({ ...empty, hourly_rate: 30, daily_rate: 100 })
    ).toBe(computeWorkerQualityScore({ ...empty, hourly_rate: 30 }));
  });

  it("skills vacío no puntúa, con al menos 1 elemento sí", () => {
    expect(computeWorkerQualityScore({ ...empty, skills: [] })).toBe(0);
    expect(computeWorkerQualityScore({ ...empty, skills: ["Excel"] })).toBe(5);
  });
});

describe("computeWorkerQualityScore (Fase C5) — rating y jobsCompleted", () => {
  const empty = {
    category: null,
    city: null,
    availability: null,
    professional_title: null,
    years_experience: null,
    hourly_rate: null,
    daily_rate: null,
    bio: null,
    skills: [] as string[],
  };

  // TEST 1 — mejor rating, resto idéntico, gana quien tiene mejor rating.
  it("1) a igualdad de todo lo demás, mejor rating produce mayor score", () => {
    const a = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 5, total_ratings: 10 },
    });
    const b = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 2, total_ratings: 10 },
    });
    expect(a).toBeGreaterThan(b);
  });

  // TEST 2 — mismo rating, más jobsCompleted gana.
  it("2) a igualdad de rating, más jobsCompleted produce mayor score", () => {
    const sameRating = { average_score: 4, total_ratings: 10 };
    const a = computeWorkerQualityScore({ ...empty, ratingSummary: sameRating, jobsCompleted: 8 });
    const b = computeWorkerQualityScore({ ...empty, ratingSummary: sameRating, jobsCompleted: 1 });
    expect(a).toBeGreaterThan(b);
  });

  // TEST 3 — cold start: sin ratingSummary y sin jobsCompleted, nunca NaN/Infinity/error, nunca penalizado por debajo de 0.
  it("3) cold start — sin ratingSummary (undefined) y jobsCompleted=0 no genera NaN/Infinity y no penaliza por debajo del score base", () => {
    const score = computeWorkerQualityScore({ ...empty, category: "Electricista" });
    expect(Number.isNaN(score)).toBe(false);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(30); // exactamente el score base de category, sin bonus ni penalización
  });

  it("3b) cold start explícito con ratingSummary=null también resuelve a 0 puntos de rating, sin error", () => {
    const score = computeWorkerQualityScore({ ...empty, ratingSummary: null, jobsCompleted: 0 });
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  // TEST 4 — rating válido + 0 jobs completados se calcula correctamente (sin error, con el bonus de rating aplicado).
  it("4) rating válido con 0 jobs completados calcula correctamente solo el bonus de rating", () => {
    const score = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 5, total_ratings: 3 },
      jobsCompleted: 0,
    });
    expect(score).toBe(30); // 5/5 * RATING_MAX_POINTS(30) + 0 de jobsCompleted
  });

  // TEST 5 — jobsCompleted muy alto queda acotado (saturación), no domina el ranking.
  it("5) jobsCompleted muy por encima de la saturación no sigue sumando puntos indefinidamente", () => {
    const at10 = computeWorkerQualityScore({ ...empty, jobsCompleted: 10 });
    const at1000 = computeWorkerQualityScore({ ...empty, jobsCompleted: 1000 });
    expect(at1000).toBe(at10);
    expect(at1000).toBe(20); // JOBS_COMPLETED_MAX_POINTS
  });

  // TEST 6 — monotonicidad de rating: mejor rating nunca da un score menor.
  it("6) monotonicidad — rating máximo (5) produce score mayor o igual que rating mínimo (0), a igualdad de lo demás", () => {
    const max = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 5, total_ratings: 5 },
    });
    const min = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 0, total_ratings: 5 },
    });
    expect(max).toBeGreaterThanOrEqual(min);
  });

  // TEST 7 — monotonicidad de jobsCompleted: más jobs nunca da un score menor.
  it("7) monotonicidad — más jobsCompleted nunca reduce el score, a igualdad de lo demás", () => {
    const scores = [0, 1, 3, 5, 10, 20].map((n) =>
      computeWorkerQualityScore({ ...empty, jobsCompleted: n })
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("un rating fuera de rango (corrupto) se clampea a [0,5], nunca produce un bonus negativo ni mayor al máximo", () => {
    const tooHigh = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 999, total_ratings: 1 },
    });
    const negative = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: -5, total_ratings: 1 },
    });
    expect(tooHigh).toBe(30); // clampeado a 5/5
    expect(negative).toBe(0); // clampeado a 0/5
  });

  it("jobsCompleted negativo (valor imposible en la práctica — es un conteo — pero defendido igual) no genera bono negativo, el score no baja del score base", () => {
    const score = computeWorkerQualityScore({ ...empty, category: "Electricista", jobsCompleted: -5 });
    expect(score).toBe(30); // solo el score base de category (30); bono de jobsCompleted = 0, nunca negativo
  });

  it("average_score = Infinity se clampea a 5 (bono máximo de rating), igual que un valor válido de 5", () => {
    const withInfinity = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: Infinity, total_ratings: 1 },
    });
    const withFive = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 5, total_ratings: 1 },
    });
    expect(withInfinity).toBe(30);
    expect(withInfinity).toBe(withFive);
  });

  it("average_score = -Infinity se clampea a 0 (sin bono de rating), nunca negativo", () => {
    const score = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: -Infinity, total_ratings: 1 },
    });
    expect(score).toBe(0);
  });

  it("average_score = NaN (nunca producido por AVG() de Postgres, pero representable en el tipo `number`) se trata como 0 puntos de rating, nunca NaN propagado al score final", () => {
    const score = computeWorkerQualityScore({
      ...empty,
      category: "Electricista",
      ratingSummary: { average_score: NaN, total_ratings: 1 },
    });
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(30); // solo el score base de category; bono de rating = 0, no NaN
  });

  it("rating y jobsCompleted se suman ENCIMA del score base de 100, sin reemplazarlo", () => {
    const full = computeWorkerQualityScore({
      category: "Electricista",
      city: "Lima",
      availability: "inmediata",
      professional_title: "Electricista industrial",
      years_experience: 5,
      hourly_rate: 30,
      daily_rate: null,
      bio: "Electricista con experiencia",
      skills: ["Soldadura"],
      ratingSummary: { average_score: 5, total_ratings: 20 },
      jobsCompleted: 15,
    });
    expect(full).toBe(150); // 100 base + 30 rating + 20 jobsCompleted (saturado)
  });

  it("rating no domina por sí solo al score base completo: un perfil vacío con rating perfecto no supera a un perfil completo sin rating", () => {
    const emptyButRated = computeWorkerQualityScore({
      ...empty,
      ratingSummary: { average_score: 5, total_ratings: 50 },
      jobsCompleted: 100,
    });
    const fullProfileNoRating = computeWorkerQualityScore({
      category: "Electricista",
      city: "Lima",
      availability: "inmediata",
      professional_title: "Electricista industrial",
      years_experience: 5,
      hourly_rate: 30,
      daily_rate: null,
      bio: "Electricista con experiencia",
      skills: ["Soldadura"],
    });
    // 0 (perfil) + 30 (rating) + 20 (jobs) = 50, vs. 100 de perfil completo.
    expect(emptyButRated).toBeLessThan(fullProfileNoRating);
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
