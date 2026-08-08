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
 * ⚠️ DIAGNÓSTICO TEMPORAL (quitar tras identificar la causa raíz del
 * "Algo salió mal" reportado al abrir ciertos perfiles) — no cambia
 * ningún comportamiento cuando el render es exitoso.
 *
 * Invoca cada sección como llamada directa a función — p.ej.
 * `AdminProfileHeader({ data })` en vez de `<AdminProfileHeader
 * data={data} />` — porque un try/catch alrededor de JSX (`<X/>`) nunca
 * atrapa el error de X: React no ejecuta el cuerpo de un componente
 * referenciado vía JSX hasta la reconciliación, que ocurre después de
 * que esta función ya retornó. Llamar al componente directamente sí
 * ejecuta su cuerpo de inmediato, así que si lanza, el try/catch lo
 * atrapa aquí — posible porque ninguno de estos 6 componentes usa hooks
 * (son Server Components puros, sin useState/useEffect/useContext).
 *
 * No reemplaza a error.tsx (agregado en el mismo commit): esto solo
 * cubre el cuerpo propio de cada uno de los 6 componentes; un error más
 * profundo (dentro de Avatar/Badge/StatCard/VerificationBadges/etc., que
 * sí se referencian vía JSX y no se ejecutan hasta la reconciliación)
 * seguiría escapando de este try/catch y lo atraparía error.tsx en su
 * lugar — por eso el diagnóstico incluye ambos mecanismos.
 */
function renderSection(label: string, profileId: string, render: () => React.ReactNode): React.ReactNode {
  try {
    return render();
  } catch (err) {
    const asError = err instanceof Error ? err : null;
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(err);
    } catch {
      serialized = undefined;
    }

    // console.error en un Server Component se escribe en los logs del
    // servidor (function logs de Netlify/Vercel), no en la consola del
    // navegador — a propósito, es donde el usuario necesita mirar.
    console.error(`[DIAG /admin/users/${profileId}] fallo al renderizar ${label}`, {
      profileId,
      component: label,
      isErrorInstance: asError !== null,
      message: asError?.message,
      stack: asError?.stack,
      digest: (err as { digest?: string } | null | undefined)?.digest,
      serialized,
    });

    return (
      <div className="card p-5 text-sm text-danger-700">
        [DIAG] {label} falló al renderizar — revisa los logs del servidor (profileId: {profileId}).
      </div>
    );
  }
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
        {renderSection("AdminProfileHeader", params.id, () => AdminProfileHeader({ data }))}
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        {renderSection("AdminProfileOverview", params.id, () => AdminProfileOverview({ data }))}
      </Reveal>

      <Reveal delay={0.15} className="mt-6">
        {renderSection("AdminProfileVerification", params.id, () => AdminProfileVerification({ data }))}
      </Reveal>

      <Reveal delay={0.2} className="mt-6">
        {renderSection("AdminProfileDocuments", params.id, () => AdminProfileDocuments({ data }))}
      </Reveal>

      {data.photos.length > 0 && (
        <Reveal delay={0.25} className="mt-6">
          {renderSection("AdminProfilePhotos", params.id, () => AdminProfilePhotos({ photos: data.photos }))}
        </Reveal>
      )}

      <Reveal delay={0.3} className="mt-6">
        {renderSection("AdminProfileActivity", params.id, () => AdminProfileActivity({ data }))}
      </Reveal>
    </div>
  );
}
