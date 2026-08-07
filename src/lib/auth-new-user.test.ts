import { describe, expect, it } from "vitest";
import { isNewOAuthUser } from "@/lib/auth-new-user";

describe("isNewOAuthUser", () => {
  it("es true cuando created_at y last_sign_in_at coinciden (primer login)", () => {
    const t = "2026-08-07T12:00:00.000Z";
    expect(isNewOAuthUser(t, t)).toBe(true);
  });

  it("es true dentro de la ventana de 10s (reloj/latencia de Supabase)", () => {
    expect(isNewOAuthUser("2026-08-07T12:00:00.000Z", "2026-08-07T12:00:05.000Z")).toBe(true);
  });

  it("es false cuando last_sign_in_at es muy posterior a created_at (login de retorno)", () => {
    expect(isNewOAuthUser("2026-01-01T00:00:00.000Z", "2026-08-07T12:00:00.000Z")).toBe(false);
  });

  it("es false si falta cualquiera de los dos timestamps", () => {
    expect(isNewOAuthUser(null, "2026-08-07T12:00:00.000Z")).toBe(false);
    expect(isNewOAuthUser("2026-08-07T12:00:00.000Z", null)).toBe(false);
    expect(isNewOAuthUser(undefined, undefined)).toBe(false);
  });
});
