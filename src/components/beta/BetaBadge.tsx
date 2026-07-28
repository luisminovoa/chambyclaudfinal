import { BETA_CONFIG } from "@/lib/beta-config";

export function BetaBadge() {
  return (
    <span
      title={`${BETA_CONFIG.stage} · ${BETA_CONFIG.version} · ${BETA_CONFIG.deployDate}`}
      className="inline-flex items-center gap-1 rounded-full border border-warning-300 bg-warning-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning-700 select-none"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning-500 animate-pulse" aria-hidden />
      Beta
    </span>
  );
}
