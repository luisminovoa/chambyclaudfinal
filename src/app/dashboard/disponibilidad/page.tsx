import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMyAvailability } from "@/lib/actions/calendar";
import { AvailabilityWeeklyEditor } from "@/components/calendar/AvailabilityWeeklyEditor";
import { AvailabilityExceptionsEditor } from "@/components/calendar/AvailabilityExceptionsEditor";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = { title: "Configurar disponibilidad | Chamby" };

/**
 * FASE 3G — Secciones 5/6. Ruta única (no worker-only / employer-only):
 * la disponibilidad se guarda por `profile_id = auth.uid()` (0051/0052),
 * la misma fila sin importar el modo activo — un usuario multi-role
 * tiene UNA sola disponibilidad, no una por rol.
 */
export default async function DisponibilidadPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/disponibilidad");

  const availability = await getMyAvailability();
  const slots = "error" in availability ? [] : availability.slots;
  const exceptions = "error" in availability ? [] : availability.exceptions;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Configurar disponibilidad
        </h1>
        <p className="mt-1 text-ink-muted">
          Define tu horario semanal habitual y las fechas puntuales en las que cambia.
        </p>
      </Reveal>

      {"error" in availability && (
        <Reveal delay={0.02}>
          <p className="mt-4 rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
            {availability.error}
          </p>
        </Reveal>
      )}

      <Reveal delay={0.05}>
        <section className="mt-8">
          <h2 className="text-base font-bold text-ink">Disponibilidad semanal</h2>
          <div className="mt-3">
            <AvailabilityWeeklyEditor initialSlots={slots} />
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="mt-8 card p-6">
          <h2 className="text-base font-bold text-ink">Excepciones</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Marca fechas concretas en las que tu disponibilidad es distinta a tu horario semanal.
          </p>
          <div className="mt-3">
            <AvailabilityExceptionsEditor initialExceptions={exceptions} />
          </div>
        </section>
      </Reveal>
    </div>
  );
}
