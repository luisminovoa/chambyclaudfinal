import Link from "next/link";
import { MapPin, Briefcase, CalendarDays, Star, CheckCircle2, Handshake, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RatingStars } from "@/components/RatingStars";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import { formatCurrency, payTypeLabel, formatMemberSince } from "@/lib/utils";
import type { EmployerPublicProfile } from "@/lib/actions/employers";

export function EmployerPublicProfileView({ data }: { data: EmployerPublicProfile }) {
  const { profile, stats, ratingSummary, jobsPublished, jobsCompleted, hires, openJobs } = data;
  const earnedBadges = stats?.badges ?? [];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{profile.full_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted sm:justify-start">
            {profile.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-primary-500" />
                {profile.city}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-primary-500" />
              En Chamby desde {formatMemberSince(profile.created_at)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
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
            <Badge tone="neutral">
              <Briefcase className="h-3 w-3" />
              {jobsPublished} {jobsPublished === 1 ? "trabajo publicado" : "trabajos publicados"}
            </Badge>
            <Badge tone="neutral">
              <CheckCircle2 className="h-3 w-3" />
              {jobsCompleted} {jobsCompleted === 1 ? "trabajo completado" : "trabajos completados"}
            </Badge>
            <Badge tone="neutral">
              <Handshake className="h-3 w-3" />
              {hires} {hires === 1 ? "contratación" : "contrataciones"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Insignias de confianza */}
      <VerificationBadges badges={earnedBadges} />

      {/* Descripción */}
      {profile.bio && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Sobre esta empresa</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{profile.bio}</p>
        </div>
      )}

      {!profile.bio && earnedBadges.length === 0 && (
        <div className="card p-5 text-center text-sm text-ink-muted">
          <Star className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          Este empleador todavía no completó la descripción de su perfil.
        </div>
      )}

      {/* Trabajos disponibles */}
      {openJobs.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Trabajos disponibles</h2>
          <div className="divide-y divide-slate-100">
            {openJobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="-mx-1 flex items-center justify-between gap-3 rounded-2xl px-1 py-3 transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{job.title}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-muted">
                    <MapPin className="h-3 w-3" />
                    {job.city} · {formatCurrency(job.pay_amount)} {payTypeLabel(job.pay_type)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
