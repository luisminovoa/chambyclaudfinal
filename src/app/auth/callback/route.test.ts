import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { exchangeCodeForSession },
  }),
}));

const ORIGIN = "https://chamby.example.com";

function req(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

function locationOf(res: Response): URL {
  const location = res.headers.get("location");
  if (!location) throw new Error("Response has no Location header");
  return new URL(location);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("callback sin parámetros: sin code ni error, cae al genérico oauth_failed", async () => {
    const res = await GET(req("/auth/callback"));
    expect(res.status).toBe(307);
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("oauth_failed");
    expect(url.searchParams.has("next")).toBe(false);
  });

  it("OAuth cancelado (error=access_denied): redirige a login preservando next", async () => {
    const res = await GET(req("/auth/callback?error=access_denied&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("oauth_cancelled");
    expect(url.searchParams.get("next")).toBe("/jobs/42");
  });

  it("enlace inválido (sin code, next=/reset-password): reset_link_expired, sin next", async () => {
    const res = await GET(req("/auth/callback?next=/reset-password"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("reset_link_expired");
    expect(url.searchParams.has("next")).toBe(false);
  });

  it("enlace expirado/reutilizado (code presente pero exchange falla, recovery)", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid grant" },
    });
    const res = await GET(req("/auth/callback?code=used-code&next=/reset-password"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("reset_link_expired");
  });

  it("enlace válido de recuperación: exchange exitoso redirige a /reset-password sin pasar por onboarding", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2020-01-01T00:00:00Z", last_sign_in_at: "2020-01-01T00:00:00Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=valid-code&next=/reset-password"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/reset-password");
  });

  it("callback OAuth Google, usuario existente: respeta next sin mandar a onboarding", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2020-01-01T00:00:00Z", last_sign_in_at: "2026-08-07T00:00:00Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/jobs/42");
  });

  it("callback OAuth Google, cuenta nueva: redirige a /onboarding con next propagado", async () => {
    const t = "2026-08-07T12:00:00.000Z";
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { created_at: t, last_sign_in_at: t } },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
    expect(url.searchParams.get("next")).toBe("/jobs/42");
  });

  it("callback OAuth Google, cuenta nueva sin next explícito: /onboarding sin querystring next", async () => {
    const t = "2026-08-07T12:00:00.000Z";
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { created_at: t, last_sign_in_at: t } },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
    expect(url.searchParams.has("next")).toBe(false);
  });
});
