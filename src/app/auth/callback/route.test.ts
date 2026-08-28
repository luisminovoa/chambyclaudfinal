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

/**
 * Fase C4-G10.5 — cierre de la brecha detectada en C4-G10.4: la ventana de
 * 10s de isNewOAuthUser() (auth-new-user.ts, sin cambios en esta fase) se
 * demostró insuficiente para confirmaciones de email con datos reales de
 * producción (gaps de 31.38s y 884.8s entre created_at y last_sign_in_at).
 * register()/resendConfirmationEmail() (auth.ts) ahora agregan
 * `flow=email_signup` a emailRedirectTo — estos tests verifican que
 * /auth/callback la usa como señal OR, independiente del tiempo
 * transcurrido, sin alterar en absoluto la rama de Google (que nunca
 * envía `flow`).
 *
 * Nota sobre `next` a través de onboarding: `next` llega hasta
 * /onboarding?next=... exactamente igual que en el flujo de Google (ver
 * tests de arriba) — src/app/onboarding/page.tsx (fuera del alcance de
 * esta fase, sin modificar) lee `searchParams.next` y se lo pasa tal cual
 * a <RoleOnboardingForm next={searchParams.next} />, confirmado por
 * lectura directa del archivo. Qué hace RoleOnboardingForm/
 * completeGoogleOnboarding() con ese `next` al completar el onboarding es
 * un comportamiento preexistente, sin cambios en esta fase, y no se
 * modifica ni se re-verifica aquí — este archivo solo prueba
 * /auth/callback.
 */
describe("GET /auth/callback — flow=email_signup (C4-G10.5)", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("registro por email con flow=email_signup y gap de 31.38s (caso real de producción, fuera de la ventana de 10s): redirige a /onboarding igual", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-08-07T12:00:00.000Z", last_sign_in_at: "2026-08-07T12:00:31.380Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
    expect(url.searchParams.get("next")).toBe("/jobs/42");
  });

  it("registro por email con flow=email_signup y gap de 884.8s (~14.7 min, segundo caso real de producción): redirige a /onboarding igual", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-08-07T12:00:00.000Z", last_sign_in_at: "2026-08-07T12:14:44.800Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
  });

  it("registro por email con flow=email_signup y timestamps idénticos (dentro de la ventana también): redirige a /onboarding (sin regresión, ambas condiciones del OR son verdaderas)", async () => {
    const t = "2026-08-07T12:00:00.000Z";
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { created_at: t, last_sign_in_at: t } },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
  });

  it("la URL de /onboarding NUNCA propaga `flow` como querystring — solo `next` continúa, exactamente igual que en el flujo de Google", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-08-07T12:00:00.000Z", last_sign_in_at: "2026-08-07T12:14:44.800Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.searchParams.has("flow")).toBe(false);
    expect(url.searchParams.get("next")).toBe("/jobs/42");
  });

  it("Google OAuth (sin flow en absoluto) para un login de retorno sigue sin ir a onboarding — la rama de Google es 100% intacta", async () => {
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

  it("flow=email_signup NO fuerza onboarding si isPasswordRecovery (next=/reset-password) — la recuperación de contraseña sigue teniendo prioridad", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-08-07T12:00:00.000Z", last_sign_in_at: "2026-08-07T12:14:44.800Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup&next=/reset-password"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/reset-password");
  });

  it("un valor de flow falsificado/manipulado (ej. flow=admin) es ignorado — cae al comportamiento normal de isNewOAuthUser(), sin ningún privilegio especial", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2020-01-01T00:00:00Z", last_sign_in_at: "2026-08-07T00:00:00Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=admin&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/jobs/42");
  });

  it("flow es sensible a mayúsculas/minúsculas (comparación literal, no case-insensitive) — 'EMAIL_SIGNUP' no activa el onboarding por sí solo", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2020-01-01T00:00:00Z", last_sign_in_at: "2026-08-07T00:00:00Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=EMAIL_SIGNUP&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/jobs/42");
  });

  it("flow=email_signup sin `code` nunca llega a evaluarse — sin sesión, cae al mismo oauth_failed genérico de siempre (forjar solo el flow no tiene ningún efecto)", async () => {
    const res = await GET(req("/auth/callback?flow=email_signup&next=/jobs/42"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("oauth_failed");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("flow=email_signup con exchange fallido (code inválido/reutilizado) tampoco fuerza onboarding — sin sesión válida no hay redirect posible más allá del error normal", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid grant" },
    });
    const res = await GET(req("/auth/callback?code=used&flow=email_signup"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("oauth_failed");
  });

  it("flow=email_signup sin next explícito: /onboarding sin querystring next (igual que el caso análogo de Google)", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-08-07T12:00:00.000Z", last_sign_in_at: "2026-08-07T12:14:44.800Z" },
      },
      error: null,
    });
    const res = await GET(req("/auth/callback?code=ok&flow=email_signup"));
    const url = locationOf(res);
    expect(url.pathname).toBe("/onboarding");
    expect(url.searchParams.has("next")).toBe(false);
  });
});
