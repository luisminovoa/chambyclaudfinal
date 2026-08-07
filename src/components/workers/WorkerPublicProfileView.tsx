import {
  MapPin,
  Briefcase,
  Star,
  CheckCircle2,
  Clock,
  Wallet,
  Languages,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RatingStars } from "@/components/RatingStars";
import { BADGE_CONFIG } from "@/components/profile/VerificationTab";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import type { WorkerPublicProfile } from "@/lib/actions/workers";
import type { AvailabilityStatus } from "@/lib/types";

const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  inmediata: "Disponibilidad inmediata",
  una_semana: "Disponible en una semana",
  un_mes: "Disponible en un mes",
  no_disponible: "No disponible por ahora",
};

export function WorkerPublicProfileView({ data }: { data: WorkerPublicProfile }) {
  const { profile, workerDetails, photos, experience, stats, ratingSummary, jobsCompleted } = data;
  const primaryTitle = getWorkerPrimaryTitle(profile, workerDetails);
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0] ?? null;
  const gallery = photos.filter((p) => p.id !== primaryPhoto?.id);
  const earnedBadges = stats?.badges ?? [];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <Avatar
          name={profile.full_name}
          src={primaryPhoto?.public_url ?? profile.avatar_url}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{profile.full_name}</h1>
          <p className="text-sm text-ink-muted">{primaryTitle}</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted sm:justify-start">
            {profile.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-primary-500" />
                {profile.city}
              </span>
            )}
            {workerDetails?.availability && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-primary-500" />
                {AVAILABILITY_LABELS[workerDetails.availability]}
              </span>
            )}
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
              <CheckCircle2 className="h-3 w-3" />
              {jobsCompleted} {jobsCompleted === 1 ? "trabajo completado" : "trabajos completados"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Insignias de confianza */}
      {earnedBadges.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Verificación</h2>
          <div className="flex flex-wrap gap-2">
            {earnedBadges.map((key) => {
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
      )}

      {/* Descripción */}
      {profile.bio && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Sobre mí</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{profile.bio}</p>
        </div>
      )}

      {/* Tarifas */}
      {(workerDetails?.hourly_rate || workerDetails?.daily_rate) && (
        <div className="card flex flex-wrap gap-4 p-5">
          {workerDetails.hourly_rate != null && (
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary-500" />
              <span className="text-sm text-ink">
                <strong>S/ {workerDetails.hourly_rate}</strong> por hora
              </span>
            </div>
          )}
          {workerDetails.daily_rate != null && (
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary-500" />
              <span className="text-sm text-ink">
                <strong>S/ {workerDetails.daily_rate}</strong> por día
              </span>
            </div>
          )}
        </div>
      )}

      {/* Galería de fotos */}
      {gallery.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Fotos</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.public_url}
                alt=""
                className="aspect-square w-full rounded-2xl object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Habilidades */}
      {profile.skills && profile.skills.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Habilidades</h2>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <Badge key={skill} tone="primary">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Idiomas */}
      {workerDetails?.languages && workerDetails.languages.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Languages className="h-4 w-4 text-primary-500" />
            Idiomas
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {workerDetails.languages.map((lang) => (
              <Badge key={lang} tone="neutral">
                {lang}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Experiencia laboral */}
      {experience.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Experiencia laboral</h2>
          <div className="space-y-4">
            {experience.map((exp) => (
              <div key={exp.id} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <Briefcase className="h-4 w-4 text-primary-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{exp.job_title}</p>
                  <p className="text-xs text-ink-muted">{exp.company}</p>
                  {exp.description && (
                    <p className="mt-1 text-xs text-ink-muted">{exp.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!profile.bio && experience.length === 0 && gallery.length === 0 && !primaryPhoto && (
        <div className="card p-5 text-center text-sm text-ink-muted">
          <Star className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          Este trabajador todavía no completó su perfil profesional.
        </div>
      )}
    </div>
  );
}
