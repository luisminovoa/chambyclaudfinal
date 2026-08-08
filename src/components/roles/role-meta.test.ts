import { describe, expect, it } from "vitest";
import { getOwnedRoles } from "./role-meta";

describe("getOwnedRoles — qué debe listar el selector de roles (RoleIndicator/RoleSwitcherCard)", () => {
  it("CASO 1/2/3: worker+employer+admin activos -> lista los 3, en orden Trabajador/Empleador/Administrador", () => {
    const owned = { worker: true, employer: true, admin: true };
    expect(getOwnedRoles(owned)).toEqual(["worker", "employer", "admin"]);
  });

  it("CASO 4: worker+employer activos, admin ausente/false -> nunca incluye admin", () => {
    const owned = { worker: true, employer: true, admin: false };
    expect(getOwnedRoles(owned)).toEqual(["worker", "employer"]);
  });

  it("CASO 5: worker+admin activos, employer false -> lista worker y admin, sin employer", () => {
    const owned = { worker: true, employer: false, admin: true };
    expect(getOwnedRoles(owned)).toEqual(["worker", "admin"]);
  });

  it("cuenta sin ningún rol activo -> lista vacía (no debería ocurrir en producción, pero no debe romper)", () => {
    const owned = { worker: false, employer: false, admin: false };
    expect(getOwnedRoles(owned)).toEqual([]);
  });

  it("solo admin activo -> lista solo Administrador", () => {
    const owned = { worker: false, employer: false, admin: true };
    expect(getOwnedRoles(owned)).toEqual(["admin"]);
  });
});
