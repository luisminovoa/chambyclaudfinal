"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { ProfileCompletionBar } from "@/components/profile/ProfileCompletionBar";
import { DocumentsTab } from "@/components/profile/DocumentsTab";
import { getEmployerCompletionItems } from "@/lib/employer-completion";
import { BADGE_CONFIG } from "@/lib/badge-config";
import type { Profile, ProfileStats, ProfilePhoto, VerificationDocument } from "@/lib/types";

interface EmployerVerificationTabProps {
  profile: Profile;
  stats: ProfileStats | null;
  photos: ProfilePhoto[];
  documents: VerificationDocument[];
  onStatsChange: (stats: ProfileStats) => void;
}

/**
 * Verificación del empleador — reutiliza completamente la
 * infraestructura de verification_documents (DocumentsTab, sin
 * modificarlo) y BADGE_CONFIG (mismo sistema de insignias que el
 * trabajador). A diferencia de VerificationTab.tsx (worker), la
 * completitud usa getEmployerCompletionItems() (src/lib/
 * employer-completion.ts) en vez de getProfileCompletionItems(), que
 * pondera skills/categoría/worker_profile_details/experiencia — campos
 * que no existen para un employer.
 */
export function EmployerVerificationTab({
  profile,
  stats,
  photos,
  documents,
  onStatsChange,
}: EmployerVerificationTabProps) {
  const earnedBadges = stats?.badges ?? [];
  const allBadges = Object.entries(BADGE_CONFIG);
  const completionItems = getEmployerCompletionItems(profile, photos, documents);
  const percentage = stats?.completion_percentage ?? 0;

  return (
    <div className="space-y-6">
      <ProfileCompletionBar percentage={percentage} items={completionItems} />

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
              <p className="text-3xl font-extrabold text-primary-600">{stats.trust_score}</p>
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
                    {earned && <CheckCircle2 className={`h-3.5 w-3.5 ${cfg.color}`} />}
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
            Sube y verifica tus documentos (DNI, RUC) para obtener tus primeras insignias
          </p>
        )}
      </div>

      <DocumentsTab initialDocuments={documents} onStatsChange={onStatsChange} />
    </div>
  );
}
