import { describe, expect, it } from "vitest";
import { canViewWorkerProfile } from "@/lib/worker-profile-access";

describe("canViewWorkerProfile", () => {
  it("permite al propio trabajador ver su perfil", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "worker-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
      })
    ).toBe(true);
  });

  it("permite a un admin ver cualquier perfil", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "admin-1",
        workerId: "worker-1",
        viewerIsAdmin: true,
        hasApplicationRelationship: false,
      })
    ).toBe(true);
  });

  it("permite a un empleador con una postulación real del trabajador", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "employer-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: true,
      })
    ).toBe(true);
  });

  it("rechaza a un usuario sin relación, sin ser admin ni el propio trabajador", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "stranger-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
      })
    ).toBe(false);
  });
});
