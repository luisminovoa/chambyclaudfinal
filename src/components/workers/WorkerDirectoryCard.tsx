import Link from "next/link";
import { MapPin, Clock, Wallet, Briefcase } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RatingStars } from "@/components/RatingStars";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import { AVAILABILITY_LABELS } from "@/lib/types";
import type { PublicWorkerListing } from "@/lib/types";

/**
 * Tarjeta del directorio de trabajadores (/workers). No existía ningún
 * componente reutilizable equivalente — JobCard es específico de `jobs`
 * (audita antes de este PR: src/components/JobCard.tsx no comparte forma
 * de datos con un trabajador). Solo renderiza columnas de
 * PublicWorkerListing (público.public_workers + rating_summary) — nunca
 * recibe ni puede recibir phone/whatsapp/birth_date/address/district
 * porque esos campos no existen en ese tipo.
 */
export function WorkerDirectoryCard({ worker }: { worker: PublicWorkerListing }) {
  const primaryTitle = getWorkerPrimaryTitle(worker, worker);
  // Evita duplicar la ocupación: cuando no hay professional_title,
  // primaryTitle YA ES worker.category (ver getWorkerPrimaryTitle) — mostrar
  // el Badge de categoría en ese caso repite exactamente el mismo texto que
  // ya aparece en el título. Solo se muestra si aporta información distinta.
  const showCategoryBadge = Boolean(worker.category) && worker.category !== primaryTitle;

  return (
    <Link
      href={`/workers/${worker.id}`}
      className="card card-hover flex flex-col gap-3 p-5 text-left"
    >
      <div className="flex items-start gap-3">
        <Avatar name={worker.full_name} src={worker.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{worker.full_name}</p>
          <p className="truncate text-xs text-ink-muted">{primaryTitle}</p>
          {worker.city && (
            <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="h-3.5 w-3.5 text-primary-500" />
              {worker.city}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {worker.ratingSummary ? (
          <span className="flex items-center gap-1">
            <RatingStars value={Math.round(worker.ratingSummary.average_score)} readOnly size="sm" />
            <span className="text-xs font-semibold text-ink">
              {worker.ratingSummary.average_score} ({worker.ratingSummary.total_ratings})
            </span>
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Sin calificaciones aún</span>
        )}
        {worker.jobsCompleted > 0 && (
          <span className="text-xs text-ink-muted">
            · {worker.jobsCompleted} {worker.jobsCompleted === 1 ? "trabajo" : "trabajos"}
          </span>
        )}
        {showCategoryBadge && <Badge tone="primary">{worker.category}</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        {worker.availability && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            {AVAILABILITY_LABELS[worker.availability]}
          </span>
        )}
        {worker.years_experience != null && (
          <span className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5 text-primary-500" />
            {worker.years_experience} {worker.years_experience === 1 ? "año" : "años"} de experiencia
          </span>
        )}
        {(worker.hourly_rate != null || worker.daily_rate != null) && (
          <span className="flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5 text-primary-500" />
            {worker.hourly_rate != null
              ? `S/ ${worker.hourly_rate}/hora`
              : `S/ ${worker.daily_rate}/día`}
          </span>
        )}
      </div>

      <span className="btn-secondary mt-1 w-full justify-center !py-2 text-sm">Ver perfil</span>
    </Link>
  );
}
