import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { Reveal } from "@/components/ui/Reveal";
import { RolesPanel } from "@/components/roles/RolesPanel";

export default async function SettingsPage() {
  const { user, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/settings");

  const hasWorker = userRoles.includes("worker");
  const hasEmployer = userRoles.includes("employer");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
      </Reveal>

      <Reveal delay={0.04}>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Configuración</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Gestiona tus roles y preferencias de cuenta.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <section className="mt-8">
          <h2 className="mb-4 text-base font-bold text-ink">Mis roles</h2>
          <RolesPanel hasWorker={hasWorker} hasEmployer={hasEmployer} />
        </section>
      </Reveal>
    </div>
  );
}
