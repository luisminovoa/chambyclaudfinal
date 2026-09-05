"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveAvailability, deleteAvailability, getMyAvailability } from "@/lib/actions/calendar";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { WEEK_DISPLAY_ORDER, WEEKDAY_LABELS } from "@/lib/calendar-format";
import type { ProfileAvailabilitySlot } from "@/lib/types";

interface AvailabilityWeeklyEditorProps {
  initialSlots: ProfileAvailabilitySlot[];
}

/**
 * FASE 3G — Sección 5A. Un rango puede activarse/desactivarse/eliminarse
 * por día; nunca reimplementa las reglas de saveAvailability()/
 * deleteAvailability() (día 0-6, inicio<fin) — solo valida en el cliente
 * lo mínimo para no enviar un formulario vacío, y siempre refleja el
 * estado real devuelto por getMyAvailability() tras cada mutación.
 */
export function AvailabilityWeeklyEditor({ initialSlots }: AvailabilityWeeklyEditorProps) {
  const [slots, setSlots] = useState(initialSlots);
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  async function refetch() {
    const fresh = await getMyAvailability();
    if (!("error" in fresh)) setSlots(fresh.slots);
  }

  function handleAddSlot(day: number) {
    setFormError(null);
    if (!newStart || !newEnd) {
      setFormError("Indica hora de inicio y hora de fin.");
      return;
    }
    if (newStart >= newEnd) {
      setFormError("La hora de inicio debe ser anterior a la hora de fin.");
      return;
    }
    startTransition(async () => {
      const result = await saveAvailability({
        kind: "slot",
        day_of_week: day,
        start_time: newStart,
        end_time: newEnd,
      });
      if (result.error) {
        toast(result.error, "error");
        setFormError(result.error);
        return;
      }
      setAddingDay(null);
      await refetch();
    });
  }

  function handleDeleteSlot(id: string) {
    startTransition(async () => {
      const result = await deleteAvailability("slot", id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      await refetch();
    });
  }

  function handleToggleDay(day: number, daySlots: ProfileAvailabilitySlot[]) {
    if (daySlots.length === 0) {
      // Activar un día sin ningún rango todavía crea uno por defecto.
      startTransition(async () => {
        const result = await saveAvailability({
          kind: "slot",
          day_of_week: day,
          start_time: "09:00",
          end_time: "18:00",
        });
        if (result.error) {
          toast(result.error, "error");
          return;
        }
        await refetch();
      });
      return;
    }

    const nextActive = !daySlots.some((s) => s.is_active);
    startTransition(async () => {
      for (const s of daySlots) {
        const result = await saveAvailability({
          kind: "slot",
          id: s.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          is_active: nextActive,
        });
        if (result.error) {
          toast(result.error, "error");
          return;
        }
      }
      await refetch();
    });
  }

  return (
    <div className="space-y-3">
      {WEEK_DISPLAY_ORDER.map((day) => {
        const daySlots = slots
          .filter((s) => s.day_of_week === day)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        const dayActive = daySlots.some((s) => s.is_active);

        return (
          <div key={day} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">{WEEKDAY_LABELS[day]}</p>
              <button
                type="button"
                role="switch"
                aria-checked={dayActive}
                aria-label={`${dayActive ? "Desactivar" : "Activar"} ${WEEKDAY_LABELS[day]}`}
                disabled={isPending}
                onClick={() => handleToggleDay(day, daySlots)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                  dayActive ? "bg-success-500" : "bg-slate-200"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200",
                    dayActive ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            {daySlots.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {daySlots.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm",
                      s.is_active ? "text-ink" : "text-ink-muted line-through"
                    )}
                  >
                    <span>
                      {s.start_time.slice(0, 5)} — {s.end_time.slice(0, 5)}
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDeleteSlot(s.id)}
                      aria-label={`Eliminar horario ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} de ${WEEKDAY_LABELS[day]}`}
                      className="text-ink-muted transition-colors hover:text-danger-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {addingDay === day ? (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    aria-label="Hora de inicio"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="input !min-h-[40px] text-xs"
                  />
                  <input
                    type="time"
                    aria-label="Hora de fin"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="input !min-h-[40px] text-xs"
                  />
                </div>
                {formError && <p className="mt-1.5 text-xs font-medium text-danger-600">{formError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAddSlot(day)}
                    className="btn-primary !rounded-xl !px-3 !py-1.5 text-xs"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingDay(null);
                      setFormError(null);
                    }}
                    className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingDay(day);
                  setNewStart("09:00");
                  setNewEnd("18:00");
                  setFormError(null);
                }}
                className="btn-ghost mt-2 !px-2 !py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar horario
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
