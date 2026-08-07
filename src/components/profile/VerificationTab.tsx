"use client";

import { ShieldCheck, Building2, Award, Star, CheckCircle2, Circle } from "lucide-react";
import { ProfileCompletionBar } from "@/components/profile/ProfileCompletionBar";
import { getProfileCompletionItems } from "@/lib/profile-completion";
import type {
  Profile,
  ProfileStats,
  ProfilePhoto,
  VerificationDocument,
  WorkerProfileDetails,
  WorkerExperience,
} from "@/lib/types";

export const BADGE_CONFIG = {
  identity_verified: {
    label: "Identidad verificada",
    description: "DNI revisado y aprobado por Chamby",
    icon: ShieldCheck,
    color: "text-primary-600",
    bg: "bg-primary-50",
    border: "border-primary-200",
  },
  ruc_active: {
    label: "RUC activo",
    description: "Número de RUC validado ante SUNAT",
    icon: Building2,
    color: "text-success-600",
    bg: "bg-success-50",
    border: "border-success-200",
  },
  certified_professional: {
    label: "Profesional certificado",
    description: "Certificado profesional verificado",
    icon: Award,
    color: "text-warning-600",
    bg: "bg-warning-50",
    border: "border-warning-200",
  },
  top_profile: {
    label: "Perfil destacado",
    description: "Perfil con completitud superior al 80%",
    icon: Star,
    color: "text-sun",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
};

interface VerificationTabProps {
  profile: Profile;
  workerDetails: WorkerProfileDetails | null;
  stats: ProfileStats | null;
  photos: ProfilePhoto[];
  documents: VerificationDocument[];
  experience: WorkerExperience[];
}

export function VerificationTab({
  profile,
  workerDetails,
  stats,
  photos,
  documents,
  experience,
}: VerificationTabProps) {
  const earnedBadges = stats?.badges ?? [];
  const allBadges = Object.entries(BADGE_CONFIG);

  const completionItems = getProfileCompletionItems(
    profile,
    workerDetails,
    photos,
    documents,
    experience
  );

  const percentage = stats?.completion_percentage ?? 0;

  return (
    <div className="space-y-6">
      {/* Completion bar */}
      <ProfileCompletionBar percentage={percentage} items={completionItems} />

      {/* Trust score */}
      {stats && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-ink">Puntuación de confianza</p>
              <p className="text-xs text-ink-muted">
                Basado en verificaciones y completitud de perfil
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-extrabold text-primary-600">
                {stats.trust_score}
              </p>
              <p className="text-xs text-ink-muted">/ 100 pts</p>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-primary-100">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-500"
              style={{ width: `${Math.min(100, stats.trust_score)}%` }}
            />
          </div>
        </div>
      )}

      {/* Badges */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">Insignias</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {allBadges.map(([id, cfg]) => {
            const earned = earnedBadges.includes(id);
            const Icon = cfg.icon;
            return (
              <div
                key={id}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-all ${
                  earned
                    ? `${cfg.bg} ${cfg.border}`
                    : "border-slate-100 bg-slate-50 opacity-50 grayscale"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    earned ? cfg.bg : "bg-slate-100"
                  }`}
                >
                  {earned ? (
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                  ) : (
                    <Icon className="h-5 w-5 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-ink">{cfg.label}</p>
                    {earned && (
                      <CheckCircle2 className={`h-3.5 w-3.5 ${cfg.color}`} />
                    )}
                    {!earned && <Circle className="h-3.5 w-3.5 text-slate-300" />}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{cfg.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {earnedBadges.length === 0 && (
          <p className="mt-4 text-center text-sm text-ink-muted">
            Sube y verifica tus documentos para obtener tus primeras insignias
          </p>
        )}
      </div>

      {/* What's pending */}
      {completionItems.some((i) => !i.done) && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
          <p className="text-sm font-bold text-primary-700">Para completar tu perfil:</p>
          <ul className="mt-2 space-y-1.5">
            {completionItems
              .filter((i) => !i.done)
              .map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-xs text-primary-700"
                >
                  <Circle className="h-3 w-3 shrink-0" />
                  {item.label} (+{item.points}%)
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
