import Link from "next/link";
import {
  MapPin,
  Briefcase,
  CalendarDays,
  Star,
  CheckCircle2,
  Handshake,
  ChevronRight,
  Pencil,
  Building2,
  User,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { RatingStars } from "@/components/RatingStars";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import { ReportButton } from "@/components/reports/ReportButton";
import { HiringConversations } from "@/components/chat/HiringConversations";
import { formatCurrency, payTypeLabel, formatMemberSince } from "@/lib/utils";
import type { EmployerPublicProfile } from "@/lib/actions/employers";
import type { HiringConversation } from "@/lib/actions/chat";

const EMPLOYER_TYPE_LABELS = { individual: "Persona", company: "Empresa" } as const;

export function EmployerPublicProfileView({
  data,
  viewerId,
  hiringConversations = [],
}: {
  data: EmployerPublicProfile;
  viewerId?: string | null;
  /** Conversaciones existentes con este empleador — getHiringConversations(), Fase C4-G6. */
  hiringConversations?: HiringConversation[];
}) {
  const { profile, stats, ratingSummary, jobsPublished, jobsCompleted, hires, openJobs } = data;
  const earnedBadges = stats?.badges ?? [];
  // Una sola sección de descripción: la empresarial (específica del
  // negocio) tiene prioridad; bio queda como respaldo para empleadores
  // que la completaron antes de que existiera business_description
  // (0030) o que prefieren solo ese campo general.
  const description = profile.business_description || profile.bio;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="card relative flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        {viewerId === profile.id ? (
          <div className="absolute right-4 top-4">
            <Link
              href="/dashboard/employer/profile"
              aria-label="Editar mi perfil"
              title="Editar mi perfil"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-ink-muted transition-colors hover:border-primary-300 hover:text-primary-600"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="absolute right-4 top-4">
            <ReportButton
              targetType="user"
              reportedUserId={profile.id}
              reportedUserRole="employer"
              targetLabel={profile.full_name}
              variant="icon"
            />
          </div>
        )}
        <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">
              {profile.business_name || profile.full_name}
            </h1>
            {profile.employer_type && (
              <Badge tone="neutral" className="items-center gap-1">
                {profile.employer_type === "company" ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  <User className="h-3 w-3" />
                )}
                {EMPLOYER_TYPE_LABELS[profile.employer_type]}
              </Badge>
            )}
          </div>
          {profile.business_name && (
            <p className="text-sm text-ink-muted">{profile.full_name}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted sm:justify-start">
            {profile.business_sector && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-primary-500" />
                {profile.business_sector}
              </span>
            )}
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

      {/* Chat: solo si ya existe una relación laboral real (contratación
          aceptada) con este empleador — nunca por el solo hecho de visitar
          el perfil. Fase C4-G6. */}
      {hiringConversations.length > 0 && (
        <div className="card p-5">
          <HiringConversations conversations={hiringConversations} />
        </div>
      )}

      {/* Confianza: trust score + insignias de verificación. Nunca se
          expone el RUC declarado ni ningún documento — solo el resultado
          calculado (badges/estado), igual que en el perfil de worker. */}
      {stats && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink">Puntuación de confianza</p>
            <p className="text-lg font-extrabold text-primary-600">
              {stats.trust_score}
              <span className="text-xs font-semibold text-ink-muted"> / 100</span>
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-100">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${Math.min(100, stats.trust_score)}%` }}
            />
          </div>
        </div>
      )}
      <VerificationBadges badges={earnedBadges} />

      {/* Descripción */}
      {description && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Sobre esta empresa</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
      )}

      {!description && earnedBadges.length === 0 && (
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
