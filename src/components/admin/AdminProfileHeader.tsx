import { MapPin, CalendarDays, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RatingStars } from "@/components/RatingStars";
import { ROLE_META, ROLE_SWITCH_ORDER } from "@/components/roles/role-meta";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import { cn, formatMemberSince } from "@/lib/utils";
import type { AdminUserProfileDetail } from "@/lib/actions/admin";

/**
 * Encabezado de la ficha administrativa — foto, nombre, oficio, ubicación,
 * verificación, rating, trust score y los 3 roles (posee vs. activo).
 * Reutiliza ROLE_META (src/components/roles/role-meta.ts) para que las
 * mismas etiquetas/colores de rol se vean igual aquí que en el selector
 * de roles del propio usuario — no se inventa un segundo mapeo.
 */
export function AdminProfileHeader({ data }: { data: AdminUserProfileDetail }) {
  const { profile, workerDetails, userRoles, photos, stats, ratingSummary } = data;
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0] ?? null;
  const primaryTitle = getWorkerPrimaryTitle(profile, workerDetails);
  const isVerified = (stats?.badges.length ?? 0) > 0;

  return (
    <div className="card p-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <Avatar name={profile.full_name} src={primaryPhoto?.public_url ?? profile.avatar_url} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">{profile.full_name}</h1>
            <Badge tone={profile.is_active ? "success" : "danger"}>
              {profile.is_active ? "Activo" : "Suspendido"}
            </Badge>
          </div>
          <p className="text-sm text-ink-muted">{primaryTitle}</p>

          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted sm:justify-start">
            {(profile.city || workerDetails?.district) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-primary-500" />
                {[profile.city, workerDetails?.district].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-primary-500" />
              En Chamby desde {formatMemberSince(profile.created_at)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {isVerified && (
              <Badge tone="primary">
                <ShieldCheck className="h-3 w-3" />
                Verificado
              </Badge>
            )}
            {ratingSummary ? (
              <span className="flex items-center gap-1.5">
                <RatingStars value={Math.round(ratingSummary.average_score)} readOnly size="sm" />
                <span className="text-xs font-semibold text-ink">
                  {ratingSummary.average_score} · {ratingSummary.total_ratings} reseñas
                </span>
              </span>
            ) : (
              <span className="text-xs text-ink-muted">Sin calificaciones aún</span>
            )}
            {stats && (
              <Badge tone="neutral">Trust Score: {stats.trust_score}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Roles que posee la cuenta vs. rol activo — solo lectura aquí, el
          cambio de rol sigue siendo exclusivo de switchRoleAction() desde
          la propia cuenta del usuario. */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {ROLE_SWITCH_ORDER.map((role) => {
          const owned = userRoles.includes(role);
          const active = profile.role === role;
          const meta = ROLE_META[role];
          return (
            <span
              key={role}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                !owned && "border-dashed border-slate-200 text-slate-300",
                owned && !active && "border-slate-200 bg-white text-ink-muted",
                active && "border-primary-200 bg-primary-50 text-primary-700"
              )}
            >
              {meta.icon ? (
                <meta.icon className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <span className={cn("h-2 w-2 rounded-full", owned ? meta.dot : "bg-slate-200")} aria-hidden />
              )}
              {meta.label}
              {active && <span className="ml-0.5">· Activo</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
