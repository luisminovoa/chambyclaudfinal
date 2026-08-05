import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { WorkerProfileClient } from "@/components/profile/WorkerProfileClient";
import {
  getProfilePhotos,
  getVerificationDocuments,
  getProfileStats,
  getWorkerProfileDetails,
  getWorkerExperience,
  computeAndSaveProfileStats,
} from "@/lib/actions/profile";
import type {
  ProfilePhoto,
  VerificationDocument,
  ProfileStats,
  WorkerProfileDetails,
  WorkerExperience,
} from "@/lib/types";

export default async function WorkerProfilePage() {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/worker/profile");
  // Accesible si el usuario POSEE el rol worker, sin importar el modo
  // activo (profile.role) — así "Mi Perfil" sigue funcionando aunque el
  // usuario esté en modo employer (docs/DISENO-MULTI-ROL.md).
  if (!profile || !userRoles.includes("worker")) redirect("/dashboard");

  const [photos, documents, statsRaw, workerDetails, experience] = await Promise.all([
    getProfilePhotos(),
    getVerificationDocuments(),
    getProfileStats(),
    getWorkerProfileDetails(),
    getWorkerExperience(),
  ]);

  // Compute stats on first visit if they don't exist yet
  let stats: ProfileStats | null = statsRaw;
  if (!stats) {
    const res = await computeAndSaveProfileStats();
    stats = "stats" in res ? (res.stats ?? null) : null;
  }

  const primaryPhoto = (photos as ProfilePhoto[]).find((p) => p.is_primary);
  const avatarSrc = primaryPhoto?.public_url ?? profile.avatar_url;

  return (
    <WorkerProfileClient
      profile={profile}
      avatarSrc={avatarSrc}
      workerDetails={workerDetails as WorkerProfileDetails | null}
      photos={photos as ProfilePhoto[]}
      documents={documents as VerificationDocument[]}
      experience={experience as WorkerExperience[]}
      initialStats={stats}
    />
  );
}
