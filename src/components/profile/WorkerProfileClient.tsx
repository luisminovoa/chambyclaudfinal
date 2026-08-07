"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Progress } from "@/components/ui/Progress";
import { Reveal } from "@/components/ui/Reveal";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { RoleSwitcherCard } from "@/components/roles/RoleSwitcherCard";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import type {
  Profile,
  ProfilePhoto,
  VerificationDocument,
  ProfileStats,
  WorkerProfileDetails,
  WorkerExperience,
  UserRole,
} from "@/lib/types";

interface WorkerProfileClientProps {
  profile: Profile;
  avatarSrc: string | null;
  workerDetails: WorkerProfileDetails | null;
  photos: ProfilePhoto[];
  documents: VerificationDocument[];
  experience: WorkerExperience[];
  initialStats: ProfileStats | null;
  userRoles: UserRole[];
}

export function WorkerProfileClient({
  profile,
  avatarSrc,
  workerDetails,
  photos,
  documents,
  experience,
  initialStats,
  userRoles,
}: WorkerProfileClientProps) {
  // Estado de completitud levantado aquí (en vez de dentro de ProfileTabs)
  // para que la barra del header y la de la pestaña Verificación se
  // actualicen ambas de inmediato tras cualquier acción, sin recargar.
  const [stats, setStats] = useState(initialStats);
  const completion = stats?.completion_percentage ?? 0;
  const primaryTitle = getWorkerPrimaryTitle(profile, workerDetails);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Back link */}
      <Reveal>
        <Link
          href="/dashboard/worker"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
      </Reveal>

      {/* Profile header */}
      <Reveal delay={0.05}>
        <div className="card mb-8 flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <div className="relative shrink-0">
            <Avatar name={profile.full_name} src={avatarSrc} size="xl" />
            {stats && stats.badges.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 shadow-sm">
                <ShieldCheck className="h-3 w-3 text-white" />
              </span>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-ink">
                {profile.full_name}
              </h1>
              <p className="text-sm text-ink-muted">{primaryTitle}</p>
              {profile.city && (
                <p className="text-xs text-ink-muted">{profile.city}</p>
              )}
            </div>

            {/* Inline completion bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-muted">
                  Perfil completado
                </span>
                <span className="font-bold text-primary-600">{completion}%</span>
              </div>
              <Progress value={completion} label="Completitud del perfil" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Mis roles */}
      <Reveal delay={0.08}>
        <RoleSwitcherCard
          role={profile.role}
          hasWorkerRole={userRoles.includes("worker")}
          hasEmployerRole={userRoles.includes("employer")}
        />
      </Reveal>

      {/* Tabs */}
      <Reveal delay={0.1}>
        <ProfileTabs
          profile={profile}
          workerDetails={workerDetails}
          photos={photos}
          documents={documents}
          experience={experience}
          stats={stats}
          onStatsChange={setStats}
        />
      </Reveal>
    </div>
  );
}
