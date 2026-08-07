import { describe, expect, it } from "vitest";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
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
