import { computeAndSaveProfileStats } from "@/lib/actions/profile";
import type { ProfileStats } from "@/lib/types";

/**
 * Recalcula profile_stats en el servidor y, si tuvo éxito, propaga el
 * resultado al estado de cliente — evita que la barra de completitud
 * quede desactualizada hasta un refresh completo de la página.
 */
export async function refreshProfileStats(
  onStatsChange: (stats: ProfileStats) => void
): Promise<void> {
  const result = await computeAndSaveProfileStats();
  if ("stats" in result && result.stats) {
    onStatsChange(result.stats);
  }
}
