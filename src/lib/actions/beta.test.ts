import { describe, expect, it, vi, beforeEach } from "vitest";
import { getBetaStats, getBugReports } from "./beta";

/**
 * Hallazgo crítico de la auditoría: getBetaStats()/getBugReports()
 * usaban createAdminClient() (service role, sin RLS) sin ningún
 * chequeo de sesión/rol. Estos tests cubren exactamente los 4
 * escenarios pedidos en la Fase 1 (Parte J): no autenticado, usuario
 * normal autenticado, admin, e invocación directa de la Server Action
 * (que en un test unitario ES la invocación directa — no hay capa de
 * UI que bypassear, la función se llama tal cual la llamaría cualquier
 * cliente con la Server Action expuesta).
 */

interface State {
  user: { id: string } | null;
  profileRole: string | null;
}

const state: State = { user: null, profileRole: null };

function countChain(result: { count?: number; data?: unknown }) {
  const chain = {
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ ...result, error: null }),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Tabla no mockeada (session client): ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: state.profileRole ? { role: state.profileRole } : null }),
          }),
        }),
      };
    },
  }),
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: () => countChain({ count: 0, data: [] }),
    }),
  }),
}));

describe("getBetaStats — cierre del bypass de autorización", () => {
  beforeEach(() => {
    state.user = null;
    state.profileRole = null;
  });

  it("1. usuario no autenticado → rechazado", async () => {
    await expect(getBetaStats()).rejects.toThrow("No autenticado");
  });

  it("2. usuario autenticado normal (no admin) → rechazado", async () => {
    state.user = { id: "worker-1" };
    state.profileRole = "worker";
    await expect(getBetaStats()).rejects.toThrow("No autorizado");
  });

  it("3. admin → permitido", async () => {
    state.user = { id: "admin-1" };
    state.profileRole = "admin";
    const stats = await getBetaStats();
    expect(stats.totalUsers).toBe(0);
  });
});

describe("getBugReports — cierre del bypass de autorización", () => {
  beforeEach(() => {
    state.user = null;
    state.profileRole = null;
  });

  it("1. usuario no autenticado → rechazado", async () => {
    await expect(getBugReports()).rejects.toThrow("No autenticado");
  });

  it("2. usuario autenticado normal (no admin) → rechazado", async () => {
    state.user = { id: "employer-1" };
    state.profileRole = "employer";
    await expect(getBugReports()).rejects.toThrow("No autorizado");
  });

  it("3. admin → permitido", async () => {
    state.user = { id: "admin-1" };
    state.profileRole = "admin";
    const reports = await getBugReports();
    expect(reports).toEqual([]);
  });
});
