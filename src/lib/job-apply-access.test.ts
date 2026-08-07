import { describe, expect, it } from "vitest";
import { canShowApplyButton } from "@/lib/job-apply-access";

describe("canShowApplyButton", () => {
  it("oculta el botón para el dueño del trabajo, sin importar su rol", () => {
    expect(canShowApplyButton({ viewerRole: "worker", isOwner: true })).toBe(false);
    expect(canShowApplyButton({ viewerRole: "employer", isOwner: true })).toBe(false);
  });

  it("muestra el botón a un trabajador que no es el dueño", () => {
    expect(canShowApplyButton({ viewerRole: "worker", isOwner: false })).toBe(true);
  });

  it("oculta el botón a un empleador (Opción A: ocultar por completo)", () => {
    expect(canShowApplyButton({ viewerRole: "employer", isOwner: false })).toBe(false);
  });

  it("oculta el botón a un admin", () => {
    expect(canShowApplyButton({ viewerRole: "admin", isOwner: false })).toBe(false);
  });

  it("muestra el botón a un visitante sin sesión — el flujo real lo manda a login", () => {
    expect(canShowApplyButton({ viewerRole: null, isOwner: false })).toBe(true);
  });
});
