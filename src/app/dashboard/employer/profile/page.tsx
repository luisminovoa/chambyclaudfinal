import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getProfilePhotos } from "@/lib/actions/profile";
import { EmployerProfileClient } from "@/components/employers/EmployerProfileClient";
import type { ProfilePhoto } from "@/lib/types";

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

  const photos = (await getProfilePhotos()) as ProfilePhoto[];
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0] ?? null;

  return <EmployerProfileClient profile={profile} initialPhoto={primaryPhoto} />;
}
