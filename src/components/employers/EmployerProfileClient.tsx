"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Image as ImageIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";
import { EmployerInfoTab } from "@/components/employers/EmployerInfoTab";
import { EmployerLogoUpload } from "@/components/employers/EmployerLogoUpload";
import type { Profile, ProfilePhoto } from "@/lib/types";

type TabId = "info" | "logo";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Información", icon: User },
  { id: "logo", label: "Foto / Logo", icon: ImageIcon },
];

interface EmployerProfileClientProps {
  profile: Profile;
  initialPhoto: ProfilePhoto | null;
}

/**
 * Shell del perfil de empleador — deliberadamente distinto de
 * WorkerProfileClient.tsx: sin barra de completitud, sin badges, sin
 * RoleSwitcherCard, solo 2 secciones (Información / Foto). El
 * encabezado enmarca el perfil como "así te ven los trabajadores" para
 * reforzar que esto es lo que aparece en /employers/[id].
 */
export function EmployerProfileClient({
  profile: initialProfile,
  initialPhoto,
}: EmployerProfileClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [photo, setPhoto] = useState(initialPhoto);
  const [activeTab, setActiveTab] = useState<TabId>("info");

  const avatarSrc = photo?.public_url ?? profile.avatar_url;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/dashboard/employer"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="card mb-8 flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <Avatar name={profile.full_name} src={avatarSrc} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">
              Perfil del empleador
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Así te ven los trabajadores: <span className="font-semibold text-ink">{profile.full_name}</span>
              {profile.city ? ` · ${profile.city}` : ""}
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <nav
          className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1"
          aria-label="Secciones del perfil de empleador"
          role="tablist"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                  activeTab === tab.id
                    ? "bg-white text-primary-600 shadow-card"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </Reveal>

      <Reveal delay={0.1}>
        {activeTab === "info" ? (
          <EmployerInfoTab
            profile={profile}
            onSaved={(updated) => setProfile((p) => ({ ...p, ...updated }))}
          />
        ) : (
          <EmployerLogoUpload profile={profile} initialPhoto={photo} onPhotoChange={setPhoto} />
        )}
      </Reveal>
    </div>
  );
}
