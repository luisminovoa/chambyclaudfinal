import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "./middleware";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Auditoría de auth hardening: no existía cobertura de test para
 * middleware.ts. `updateSession()` (src/lib/supabase/middleware.ts) hace
 * la llamada real a Supabase (@supabase/ssr) — se mockea aquí, igual que
 * el resto del repo mockea @/lib/supabase/server, para probar
 * exclusivamente la lógica de clasificación de rutas (PROTECTED_PREFIXES)
 * y la redirección a /login?next=..., sin depender de una sesión real.
 */
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(),
}));

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://chamby.example.com"));
}

function mockSession(user: { id: string } | null) {
  vi.mocked(updateSession).mockResolvedValue({
    response: NextResponse.next(),
    user: user as never,
  });
}

describe("middleware() — Capa 1 (early redirect)", () => {
  it("visitante sin sesión → /dashboard: redirige a /login con next=/dashboard", async () => {
    mockSession(null);
    const res = await middleware(req("/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("visitante sin sesión → /admin: redirige a /login", async () => {
    mockSession(null);
    const res = await middleware(req("/admin"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin");
  });

  it("visitante sin sesión → /jobs/new: redirige a /login", async () => {
    mockSession(null);
    const res = await middleware(req("/jobs/new"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("visitante sin sesión → /onboarding: redirige a /login", async () => {
    mockSession(null);
    const res = await middleware(req("/onboarding"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("visitante sin sesión → /messages: redirige a /login (hardening — antes solo tenía Capa 2)", async () => {
    mockSession(null);
    const res = await middleware(req("/messages"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/messages");
  });

  it("visitante sin sesión → /messages/[conversationId]: redirige a /login (prefijo cubre subrutas)", async () => {
    mockSession(null);
    const res = await middleware(req("/messages/conv-123"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/messages/conv-123");
  });

  it("visitante sin sesión → /notifications: redirige a /login (hardening — antes solo tenía Capa 2)", async () => {
    mockSession(null);
    const res = await middleware(req("/notifications"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/notifications");
  });

  it("usuario autenticado → /dashboard: pasa (sin redirect)", async () => {
    mockSession({ id: "user-1" });
    const res = await middleware(req("/dashboard"));
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("usuario autenticado → /messages: pasa (sin redirect)", async () => {
    mockSession({ id: "user-1" });
    const res = await middleware(req("/messages"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("visitante sin sesión → / (ruta pública): pasa sin redirect", async () => {
    mockSession(null);
    const res = await middleware(req("/"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("visitante sin sesión → /jobs (listado público, no /jobs/new): pasa sin redirect", async () => {
    mockSession(null);
    const res = await middleware(req("/jobs"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("visitante sin sesión → /jobs/some-id (detalle público de un job): pasa sin redirect", async () => {
    mockSession(null);
    const res = await middleware(req("/jobs/some-id"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("visitante sin sesión → /workers/some-id (perfil público): pasa sin redirect", async () => {
    mockSession(null);
    const res = await middleware(req("/workers/some-id"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("visitante sin sesión → /login: pasa sin redirect (evita loop de redirección)", async () => {
    mockSession(null);
    const res = await middleware(req("/login"));
    expect(res.headers.get("location")).toBeNull();
  });
});
