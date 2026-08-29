import Link from "next/link";
import { MapPin, Image as ImageIcon, FileText, Star, Briefcase, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ProfileCompletionBar } from "@/components/profile/ProfileCompletionBar";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import { getProfileCompletionItems, getWorkerPrimaryTitle } from "@/lib/profile-completion";
import type {
  Profile,
  ProfilePhoto,
  VerificationDocument,
  ProfileStats,
  WorkerProfileDetails,
  WorkerExperience,
  RatingSummary,
} from "@/lib/types";

interface DashboardProfileCardProps {
  profile: Profile;
  avatarSrc: string | null;
  stats: ProfileStats | null;
  photos: ProfilePhoto[];
  documents: VerificationDocument[];
  workerDetails: WorkerProfileDetails | null;
  experience: WorkerExperience[];
  ratingSummary: RatingSummary | null;
}

export function DashboardProfileCard({
  profile,
  avatarSrc,
  stats,
  photos,
  documents,
  workerDetails,
  experience,
  ratingSummary,
}: DashboardProfileCardProps) {
  const completion = stats?.completion_percentage ?? 0;
  const primaryTitle = getWorkerPrimaryTitle(profile, workerDetails);
  const completionItems = getProfileCompletionItems(
    profile,
    workerDetails,
    photos,
    documents,
    experience
  );
  const badges = stats?.badges ?? [];
  const isIncomplete = completion < 80;
  // Fase 5 / C4-G16: antes era `completion > 90`, un umbral local
  // desincronizado del real (`top_profile` se otorga con `score >= 80` en
  // computeAndSaveProfileStats()). Se lee directamente el badge ya
  // calculado — misma fuente de verdad que VerificationBadges y
  // VerificationTab, sin recalcular nada aquí.
  const isFeatured = badges.includes("top_profile");

  return (
    <section className="card p-6" aria-labelledby="mi-perfil">
      <div className="flex items-start gap-4">
        <Avatar name={profile.full_name} src={avatarSrc} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="mi-perfil" className="truncate text-lg font-extrabold text-ink">
              {profile.full_name}
            </h2>
            {isFeatured && (
              <Badge tone="warning" className="shrink-0">
                <Sparkles className="h-3 w-3" />
                Perfil destacado
              </Badge>
            )}
          </div>
          <p className="truncate text-sm text-ink-muted">{primaryTitle}</p>
          {profile.city && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="h-3 w-3 shrink-0" />
              {profile.city}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <ProfileCompletionBar percentage={completion} items={completionItems} />
      </div>

      {isIncomplete && (
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-3 text-xs font-medium text-warning-700">
          Completa tu perfil para aumentar tus oportunidades laborales.
        </div>
      )}

      {/* Fase 5 / C4-G16: antes esta card tenía su propio verificationBadge()
          — un estado agregado ("Verificado"/"En revisión"/"Sin verificar")
          calculado sobre `documents`, con semántica distinta a las 3
          insignias documentales independientes que FASE 2 ya construyó.
          Se reemplaza por el mismo componente que usan ambos perfiles
          públicos, con el mismo dato (`stats.badges`) ya disponible por
          props — sin nueva fuente de verdad, sin nueva consulta. */}
      <div className="mt-5 border-t border-slate-100 pt-5">
        <VerificationBadges badges={badges} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 text-sm">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Fotos</dt>
            <dd className="font-semibold text-ink">{photos.length}/10</dd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Documentos</dt>
            <dd className="font-semibold text-ink">{documents.length}</dd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Experiencia</dt>
            <dd className="font-semibold text-ink">
              {workerDetails?.years_experience != null
                ? `${workerDetails.years_experience} años`
                : "—"}
            </dd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Calificación</dt>
            <dd className="font-semibold text-ink">
              {ratingSummary ? ratingSummary.average_score : "—"}
            </dd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Reseñas</dt>
            <dd className="font-semibold text-ink">{ratingSummary?.total_ratings ?? 0}</dd>
          </div>
        </div>
      </dl>

      {profile.skills && profile.skills.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Habilidades
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <Badge key={skill} tone="primary">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-5">
        <Link href="/dashboard/worker/profile" className="btn-primary w-full justify-center">
          Editar Perfil
        </Link>
      </div>
    </section>
  );
}
