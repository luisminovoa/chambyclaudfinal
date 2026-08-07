import { BADGE_CONFIG } from "@/components/profile/VerificationTab";

/**
 * Insignias de confianza en un perfil público — compartido entre
 * WorkerPublicProfileView y EmployerPublicProfileView para no duplicar el
 * mapeo icono/color/label de BADGE_CONFIG en cada uno.
 */
export function VerificationBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Verificación</h2>
      <div className="flex flex-wrap gap-2">
        {badges.map((key) => {
          const cfg = BADGE_CONFIG[key as keyof typeof BADGE_CONFIG];
          if (!cfg) return null;
          const Icon = cfg.icon;
          return (
            <span
              key={key}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${cfg.bg} ${cfg.color} ${cfg.border}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
