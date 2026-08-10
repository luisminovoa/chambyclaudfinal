import { ShieldCheck, Percent, Star } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import type { AdminUserProfileDetail } from "@/lib/actions/admin";

/** Confianza y verificación — mismos números que ya calcula/persiste
 * computeAndSaveProfileStats() (src/lib/actions/profile.ts), sin
 * recalcular nada aquí. */
export function AdminProfileVerification({ data }: { data: AdminUserProfileDetail }) {
  const { stats, ratingSummary } = data;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-ink">Confianza y verificación</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={ShieldCheck} label="Trust Score" value={stats?.trust_score ?? 0} tone="primary" />
        <StatCard
          icon={Percent}
          label="Perfil completado"
          value={`${stats?.completion_percentage ?? 0}%`}
          tone="success"
        />
        <StatCard
          icon={Star}
          label="Rating"
          value={ratingSummary ? ratingSummary.average_score : "—"}
          hint={ratingSummary ? `${ratingSummary.total_ratings} reseñas` : "Sin calificaciones"}
          tone="warning"
        />
      </div>
      {stats && stats.badges.length > 0 ? (
        <VerificationBadges badges={stats.badges} />
      ) : (
        <p className="text-sm text-ink-muted">Sin insignias de verificación todavía.</p>
      )}
    </div>
  );
}
