"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveAvailability, deleteAvailability, getMyAvailability } from "@/lib/actions/calendar";
import { useToast } from "@/components/ui/Toaster";
import { formatDate } from "@/lib/utils";
import type { ProfileAvailabilityException } from "@/lib/types";

interface AvailabilityExceptionsEditorProps {
  initialExceptions: ProfileAvailabilityException[];
}

/**
 * FASE 3G — Sección 6. "No disponible" nunca envía horario;
 * "Disponible en horario especial" siempre exige ambos — el mismo par de
 * reglas que ya aplica saveAvailability(), reafirmado aquí solo para dar
 * un mensaje inmediato sin ida y vuelta al servidor.
 */
export function AvailabilityExceptionsEditor({ initialExceptions }: AvailabilityExceptionsEditorProps) {
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  async function refetch() {
    const fresh = await getMyAvailability();
    if (!("error" in fresh)) setExceptions(fresh.exceptions);
  }

  function handleSave() {
    setFormError(null);
    if (!date) {
      setFormError("Selecciona una fecha.");
      return;
    }
    if (isAvailable && (!startTime || !endTime)) {
      setFormError("Indica hora de inicio y hora de fin.");
      return;
    }
    startTransition(async () => {
      const result = await saveAvailability(
        isAvailable
          ? { kind: "exception", exception_date: date, is_available: true, start_time: startTime, end_time: endTime }
          : { kind: "exception", exception_date: date, is_available: false }
      );
      if (result.error) {
        toast(result.error, "error");
        setFormError(result.error);
        return;
      }
      toast("Excepción guardada", "success");
      setAdding(false);
      setDate("");
      await refetch();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteAvailability("exception", id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      await refetch();
    });
  }

  const sorted = [...exceptions].sort((a, b) => a.exception_date.localeCompare(b.exception_date));

  return (
    <div>
      {sorted.length === 0 && !adding && (
        <p className="text-sm text-ink-muted">No tienes excepciones registradas.</p>
      )}

      {sorted.length > 0 && (
        <ul className="space-y-1.5">
          {sorted.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-ink"
            >
              <span>
                {formatDate(e.exception_date)} ·{" "}
                {e.is_available
                  ? `Disponible ${e.start_time?.slice(0, 5)}–${e.end_time?.slice(0, 5)}`
                  : "No disponible"}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(e.id)}
                aria-label={`Eliminar excepción del ${formatDate(e.exception_date)}`}
                className="text-ink-muted transition-colors hover:text-danger-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <input
            type="date"
            aria-label="Fecha de la excepción"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input text-xs"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <input type="radio" checked={!isAvailable} onChange={() => setIsAvailable(false)} />
              No disponible
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <input type="radio" checked={isAvailable} onChange={() => setIsAvailable(true)} />
              Disponible en horario especial
            </label>
          </div>
          {isAvailable && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="time"
                aria-label="Desde"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input !min-h-[40px] text-xs"
              />
              <input
                type="time"
                aria-label="Hasta"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input !min-h-[40px] text-xs"
              />
            </div>
          )}
          {formError && <p className="mt-1.5 text-xs font-medium text-danger-600">{formError}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="btn-primary !rounded-xl !px-3 !py-1.5 text-xs"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="btn-ghost !rounded-xl !px-3 !py-1.5 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost mt-3 !px-2 !py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Agregar excepción
        </button>
      )}
    </div>
  );
}
