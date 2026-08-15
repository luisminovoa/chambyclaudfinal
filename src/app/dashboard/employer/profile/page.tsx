import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import {
  getProfilePhotos,
  getVerificationDocuments,
  getProfileStats,
  computeAndSaveProfileStats,
} from "@/lib/actions/profile";
import { EmployerProfileClient } from "@/components/employers/EmployerProfileClient";
import type { ProfilePhoto, ProfileStats, VerificationDocument } from "@/lib/types";

export const metadata: Metadata = { title: "Editar perfil | Chamby" };

export default async function EmployerProfilePage() {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/employer/profile");
  // Accesible si el usuario POSEE el rol employer, sin importar el modo
  // activo (profile.role) — mismo criterio que
  // /dashboard/worker/profile (docs/DISENO-MULTI-ROL.md): un empleador
  // con ambos roles no debe perder acceso a su propio perfil solo por
  // estar navegando en modo worker.
  if (!profile || !userRoles.includes("employer")) redirect("/dashboard");

  const [photos, documents, statsRaw] = await Promise.all([
    getProfilePhotos(),
    getVerificationDocuments(),
    getProfileStats(),
  ]);
  const primaryPhoto =
    (photos as ProfilePhoto[]).find((p) => p.is_primary) ?? (photos as ProfilePhoto[])[0] ?? null;

  // Mismo criterio que /dashboard/worker/profile: calcular stats en la
  // primera visita si todavía no existen.
  let stats: ProfileStats | null = statsRaw;
  if (!stats) {
    const res = await computeAndSaveProfileStats();
    stats = "stats" in res ? (res.stats ?? null) : null;
  }

  return (
    <EmployerProfileClient
      profile={profile}
      initialPhoto={primaryPhoto}
      documents={documents as VerificationDocument[]}
      initialStats={stats}
    />
  );
}
