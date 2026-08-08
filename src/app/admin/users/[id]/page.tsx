import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminUserProfile } from "@/lib/actions/admin";
import { AdminProfileHeader } from "@/components/admin/AdminProfileHeader";
import { AdminProfileOverview } from "@/components/admin/AdminProfileOverview";
import { AdminProfileVerification } from "@/components/admin/AdminProfileVerification";
import { AdminProfileDocuments } from "@/components/admin/AdminProfileDocuments";
import { AdminProfilePhotos } from "@/components/admin/AdminProfilePhotos";
import { AdminProfileActivity } from "@/components/admin/AdminProfileActivity";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = { title: "Perfil de usuario | Admin Chamby" };

interface Props {
  params: { id: string };
}

/**
 * Protegida por dos capas antes de llegar aquí: middleware.ts (prefijo
 * /admin exige sesión) y src/app/admin/layout.tsx (redirige si
 * profile.role !== "admin") — ya envuelve toda esta ruta, no hace falta
 * repetir el chequeo de rol en la página. getAdminUserProfile() agrega la
 * tercera capa (assertAdmin() dentro del propio Server Action), para que
 * la autorización no dependa solo de que la UI oculte el enlace.
 */
export default async function AdminUserProfilePage({ params }: Props) {
  const data = await getAdminUserProfile(params.id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/admin/users"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a usuarios
        </Link>
      </Reveal>

      <Reveal delay={0.05}>
        <AdminProfileHeader data={data} />
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <AdminProfileOverview data={data} />
      </Reveal>

      <Reveal delay={0.15} className="mt-6">
        <AdminProfileVerification data={data} />
      </Reveal>

      <Reveal delay={0.2} className="mt-6">
        <AdminProfileDocuments data={data} />
      </Reveal>

      {data.photos.length > 0 && (
        <Reveal delay={0.25} className="mt-6">
          <AdminProfilePhotos photos={data.photos} />
        </Reveal>
      )}

      <Reveal delay={0.3} className="mt-6">
        <AdminProfileActivity data={data} />
      </Reveal>
    </div>
  );
}
