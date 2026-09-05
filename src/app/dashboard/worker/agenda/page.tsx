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
 * FASE 3G — Sección 2. Gated por rol POSEÍDO (user_roles), no por
 * profiles.role — mismo criterio que /dashboard/worker/profile: un
 * usuario worker+employer no pierde su agenda de trabajador solo por
 * estar navegando en modo empleador.
 */
export default async function WorkerAgendaPage() {
  const { user, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/worker/agenda");
  if (!userRoles.includes("worker")) redirect("/dashboard");

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
        <p className="mt-1 text-ink-muted">Tus próximos trabajos con horario confirmado.</p>
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
            <CalendarAgenda jobs={calendar.asWorker} role="worker" />
          </Reveal>
        )}
      </div>
    </div>
  );
}
