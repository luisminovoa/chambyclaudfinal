import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
import { Progress } from "@/components/ui/Progress";
import { Reveal } from "@/components/ui/Reveal";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import {
  getProfilePhotos,
  getVerificationDocuments,
  getProfileStats,
  computeAndSaveProfileStats,
} from "@/lib/actions/profile";
import type { ProfilePhoto, VerificationDocument, ProfileStats } from "@/lib/types";

export default async function WorkerProfilePage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/worker/profile");
  if (!profile || profile.role !== "worker") redirect("/dashboard");

  const [photos, documents, statsRaw] = await Promise.all([
    getProfilePhotos(),
    getVerificationDocuments(),
    getProfileStats(),
  ]);

  // Compute stats on first visit if they don't exist yet
  let stats: ProfileStats | null = statsRaw;
  if (!stats) {
    const res = await computeAndSaveProfileStats();
    stats = "stats" in res ? (res.stats ?? null) : null;
  }

  const primaryPhoto = (photos as ProfilePhoto[]).find((p) => p.is_primary);
  const avatarSrc = primaryPhoto?.public_url ?? profile.avatar_url;
  const completion = stats?.completion_percentage ?? 0;

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
              {profile.category && (
                <p className="text-sm text-ink-muted">{profile.category}</p>
              )}
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

      {/* Tabs */}
      <Reveal delay={0.1}>
        <ProfileTabs
          profile={profile}
          photos={photos as ProfilePhoto[]}
          documents={documents as VerificationDocument[]}
          stats={stats}
        />
      </Reveal>
    </div>
  );
}
