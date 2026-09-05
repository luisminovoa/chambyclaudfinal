import { CalendarClock } from "lucide-react";
import { WEEK_DISPLAY_ORDER, WEEKDAY_LABELS } from "@/lib/calendar-format";
import type { ProfileAvailabilitySlot } from "@/lib/types";

interface PublicAvailabilityCardProps {
  /** Ya filtrados a solo activos por getProfileAvailability() — nunca excepciones (no son públicas). */
  slots: ProfileAvailabilitySlot[];
}

/** FASE 3G — Sección 7. No renderiza nada si no hay disponibilidad configurada, en vez de una sección vacía. */
export function PublicAvailabilityCard({ slots }: PublicAvailabilityCardProps) {
  if (slots.length === 0) return null;

  return (
    <div className="card p-6">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <CalendarClock className="h-5 w-5 text-primary-500" />
        Disponibilidad
      </h2>
      <ul className="mt-3 space-y-1.5">
        {WEEK_DISPLAY_ORDER.map((day) => {
          const daySlots = slots
            .filter((s) => s.day_of_week === day)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          if (daySlots.length === 0) return null;
          return (
            <li
              key={day}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-ink">{WEEKDAY_LABELS[day]}</span>
              <span className="text-ink-muted">
                {daySlots.map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`).join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
