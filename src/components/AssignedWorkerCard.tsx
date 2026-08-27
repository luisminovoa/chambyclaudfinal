import Link from "next/link";
import { MapPin, Briefcase, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { RatingStars } from "@/components/RatingStars";
import type { PublicWorkerSummary, RatingSummary } from "@/lib/types";

interface AssignedWorkerCardProps {
  worker: PublicWorkerSummary;
  rating: RatingSummary | null;
  /** conversationId de ESTE job (getConversationIdForJob(), Fase C4-G6) — null si aún no existe. */
  conversationId?: string | null;
}

export function AssignedWorkerCard({ worker, rating, conversationId = null }: AssignedWorkerCardProps) {
  return (
    <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/40 p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary-600">
        Trabajador asignado
      </p>
      <div className="flex items-center gap-3">
        <Avatar name={worker.full_name} src={worker.avatar_url} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{worker.full_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            {worker.category && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {worker.category}
              </span>
            )}
            {worker.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {worker.city}
              </span>
            )}
          </div>
          {rating ? (
            <div className="mt-1 flex items-center gap-1.5">
              <RatingStars value={Math.round(rating.average_score)} readOnly size="sm" />
              <span className="text-xs font-medium text-ink-muted">
                {rating.average_score} · {rating.total_ratings} reseñas
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Sin calificaciones aún</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Link
          href={`/workers/${worker.id}`}
          className="btn-secondary flex-1 justify-center !py-2 text-xs"
        >
          Ver perfil
        </Link>
        {conversationId && (
          <Link
            href={`/messages/${conversationId}`}
            className="btn-secondary flex-1 justify-center !py-2 text-xs"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            💬 Abrir chat
          </Link>
        )}
      </div>
    </div>
  );
}
