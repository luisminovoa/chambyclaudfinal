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
        viewerIsEmployer: false,
        workerIsActiveWorker: false,
      })
    ).toBe(true);
  });

  it("permite al propio trabajador ver su perfil aunque esté inactivo", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "worker-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
        viewerIsEmployer: false,
        workerIsActiveWorker: false,
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
        viewerIsEmployer: false,
        workerIsActiveWorker: false,
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
        viewerIsEmployer: true,
        workerIsActiveWorker: false,
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
        viewerIsEmployer: false,
        workerIsActiveWorker: false,
      })
    ).toBe(false);
  });

  // ============================================================
  // Fase 2 — directorio de trabajadores: empleador sin relación previa
  // ============================================================

  it("C) permite a un empleador autenticado sin relación ver a un trabajador ACTIVO", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "employer-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
        viewerIsEmployer: true,
        workerIsActiveWorker: true,
      })
    ).toBe(true);
  });

  it("D) rechaza a un empleador autenticado sin relación viendo a un trabajador INACTIVO", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "employer-1",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
        viewerIsEmployer: true,
        workerIsActiveWorker: false,
      })
    ).toBe(false);
  });

  it("B) NO amplía el acceso de un trabajador viendo a OTRO trabajador (viewerIsEmployer=false)", () => {
    expect(
      canViewWorkerProfile({
        viewerId: "worker-2",
        workerId: "worker-1",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
        viewerIsEmployer: false,
        workerIsActiveWorker: true,
      })
    ).toBe(false);
  });

  it("rechaza a un empleador sin relación cuando el target no es un worker (p.ej. otro employer) aunque esté activo", () => {
    // workerIsActiveWorker ya codifica "role = worker AND is_active" — un
    // employer nunca produce workerIsActiveWorker=true, así que esta rama
    // nunca autoriza employer→employer. Prueba explícita del contrato.
    expect(
      canViewWorkerProfile({
        viewerId: "employer-1",
        workerId: "employer-2",
        viewerIsAdmin: false,
        hasApplicationRelationship: false,
        viewerIsEmployer: true,
        workerIsActiveWorker: false,
      })
    ).toBe(false);
  });
});
