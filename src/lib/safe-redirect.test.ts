import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath()", () => {
  it("acepta una ruta interna simple", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("acepta una ruta interna con segmentos y query string", () => {
    expect(safeNextPath("/dashboard/employer/profile?tab=info")).toBe(
      "/dashboard/employer/profile?tab=info"
    );
  });

  it("rechaza una URL externa absoluta", () => {
    expect(safeNextPath("https://evil.example.com/phish")).toBeNull();
  });

  it("rechaza un protocol-relative URL (//)", () => {
    expect(safeNextPath("//evil.example.com")).toBeNull();
  });

  it("rechaza el vector userinfo@host (next=@evil.com concatenado a un origin)", () => {
    // El propio valor de `next` no necesita contener el origin: basta con
    // que no sea una ruta de un solo `/` inicial para que se rechace,
    // exactamente el caso real que permitía `${origin}${next}` en
    // /auth/callback resolver a un host distinto.
    expect(safeNextPath("@evil.example.com")).toBeNull();
  });

  it("rechaza backslashes (algunos navegadores los normalizan a /)", () => {
    expect(safeNextPath("/\\evil.example.com")).toBeNull();
  });

  it("rechaza valores no-string", () => {
    const file = new File(["x"], "x.txt");
    expect(safeNextPath(file)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("rechaza cadena vacía", () => {
    expect(safeNextPath("")).toBeNull();
  });

  it("rechaza una ruta que no empieza con /", () => {
    expect(safeNextPath("dashboard")).toBeNull();
  });

  it("rechaza valores más largos de 500 caracteres", () => {
    expect(safeNextPath("/" + "a".repeat(500))).toBeNull();
  });
});
