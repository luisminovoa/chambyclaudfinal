import { describe, expect, it, vi, beforeEach } from "vitest";
import { refreshProfileStats } from "./profile-stats";
import type { ProfileStats } from "./types";

const computeAndSaveProfileStats = vi.fn();
vi.mock("@/lib/actions/profile", () => ({
  computeAndSaveProfileStats: (...args: unknown[]) => computeAndSaveProfileStats(...args),
}));

/**
 * refreshProfileStats() es el mecanismo que InfoTab.tsx (worker) ya
 * usaba tras guardar, y que EmployerInfoTab.tsx ahora también invoca
 * tras un updateProfile() exitoso (fix post-auditoría de 272b3d4). No
 * tenía test propio — solo se probaba indirectamente a través de
 * computeAndSaveProfileStats(). Estos casos cubren exactamente el
 * contrato que EmployerInfoTab pasa a depender: éxito -> se notifica al
 * padre con las stats frescas; error -> nunca se notifica.
 */
describe("refreshProfileStats()", () => {
  beforeEach(() => computeAndSaveProfileStats.mockReset());

  it("caso exitoso: computeAndSaveProfileStats() devuelve stats -> onStatsChange se llama con las stats frescas", async () => {
    const stats: ProfileStats = {
      profile_id: "employer-1",
      completion_percentage: 75,
      trust_score: 78,
      badges: ["ruc_active"],
      updated_at: "2026-01-01T00:00:00Z",
    };
    computeAndSaveProfileStats.mockResolvedValue({ success: true, stats });

    const onStatsChange = vi.fn();
    await refreshProfileStats(onStatsChange);

    expect(onStatsChange).toHaveBeenCalledTimes(1);
    expect(onStatsChange).toHaveBeenCalledWith(stats);
  });

  it("caso de error: computeAndSaveProfileStats() devuelve error -> onStatsChange NUNCA se llama", async () => {
    computeAndSaveProfileStats.mockResolvedValue({ error: "No autenticado." });

    const onStatsChange = vi.fn();
    await refreshProfileStats(onStatsChange);

    expect(onStatsChange).not.toHaveBeenCalled();
  });

  it("caso límite: success sin stats (no debería ocurrir en la práctica) tampoco notifica", async () => {
    computeAndSaveProfileStats.mockResolvedValue({ success: true });

    const onStatsChange = vi.fn();
    await refreshProfileStats(onStatsChange);

    expect(onStatsChange).not.toHaveBeenCalled();
  });
});
