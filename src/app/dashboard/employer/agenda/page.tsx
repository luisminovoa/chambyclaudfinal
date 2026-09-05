import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCog } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMyCalendar } from "@/lib/actions/calendar";
import { CalendarAgenda } from "@/components/calendar/CalendarAgenda";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Mi agenda | Chamby" };

/**
 * FASE 3G — Sección 3. Mismo criterio de acceso multi-role que
 * /dashboard/worker/agenda: gated por user_roles, no por profiles.role.
 */
export default async function EmployerAgendaPage() {
  const { user, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/employer/agenda");
  if (!userRoles.includes("employer")) redirect("/dashboard");

  const calendar = await getMyCalendar();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Mi agenda</h1>
          <Link href="/dashboard/disponibilidad" className="btn-secondary">
            <CalendarCog className="h-4 w-4" />
            Configurar disponibilidad
          </Link>
        </div>
        <p className="mt-1 text-ink-muted">Trabajos agendados de tus publicaciones.</p>
      </Reveal>

      <div className="mt-8">
        {"error" in calendar ? (
          <Reveal>
            <EmptyState
              pose="lost"
              title="No pudimos cargar tu agenda"
              description="Intenta recargar la página en unos segundos."
            />
          </Reveal>
        ) : (
          <Reveal delay={0.05}>
            <CalendarAgenda jobs={calendar.asEmployer} role="employer" />
          </Reveal>
        )}
      </div>
    </div>
  );
}
