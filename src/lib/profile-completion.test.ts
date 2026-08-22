import { describe, expect, it } from "vitest";
import { getWorkerPrimaryTitle, getProfileCompletionItems } from "@/lib/profile-completion";
import type { Profile, WorkerProfileDetails } from "@/lib/types";

const baseProfile = { category: "Electricista" } as Profile;

describe("getWorkerPrimaryTitle", () => {
  it("prioriza professional_title cuando existe", () => {
    const workerDetails = { professional_title: "Electricista certificado" } as WorkerProfileDetails;
    expect(getWorkerPrimaryTitle(baseProfile, workerDetails)).toBe("Electricista certificado");
  });

  it("cae a profile.category si no hay professional_title", () => {
    const workerDetails = { professional_title: null } as unknown as WorkerProfileDetails;
    expect(getWorkerPrimaryTitle(baseProfile, workerDetails)).toBe("Electricista");
  });

  it("cae a 'Sin especialidad' si no hay ni professional_title ni category", () => {
    const profile = { category: null } as unknown as Profile;
    expect(getWorkerPrimaryTitle(profile, null)).toBe("Sin especialidad");
  });
});

describe("getProfileCompletionItems — impacto de category/city (Fase B, sin cambios de peso)", () => {
  const fullProfile = { category: "Electricista", city: "Lima", bio: "hola", skills: ["a", "b", "c"] } as Profile;

  it("8) category vacío ya cuenta como incompleto hoy — el ítem 'Especialidad' (existente, sin cambios) queda done:false", () => {
    const items = getProfileCompletionItems(
      { ...fullProfile, category: null } as Profile,
      null,
      [],
      [],
      []
    );
    const especialidad = items.find((i) => i.label === "Especialidad");
    expect(especialidad?.done).toBe(false);
  });

  it("category presente cuenta como completo — mismo ítem, comportamiento ya existente, sin regresión", () => {
    const items = getProfileCompletionItems(fullProfile, null, [], [], []);
    const especialidad = items.find((i) => i.label === "Especialidad");
    expect(especialidad?.done).toBe(true);
  });

  it("9) city NO forma parte todavía del desglose de completitud (decisión documentada de Fase B, no un olvido): ningún ítem depende de profile.city", () => {
    const itemsWithCity = getProfileCompletionItems({ ...fullProfile, city: "Lima" } as Profile, null, [], [], []);
    const itemsWithoutCity = getProfileCompletionItems({ ...fullProfile, city: null } as Profile, null, [], [], []);
    expect(itemsWithCity).toEqual(itemsWithoutCity);
    expect(itemsTotal(itemsWithCity)).toBe(itemsTotal(itemsWithoutCity));
  });
});

function itemsTotal(items: { points: number; done: boolean }[]): number {
  return items.filter((i) => i.done).reduce((sum, i) => sum + i.points, 0);
}
