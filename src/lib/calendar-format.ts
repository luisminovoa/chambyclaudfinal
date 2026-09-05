import { formatDate } from "@/lib/utils";

/**
 * Formato de hora local ("HH:mm") para un timestamp ISO — mismo criterio
 * de zona horaria que formatDate()/formatMemberSince() (src/lib/utils.ts):
 * usa la zona horaria del entorno de ejecución (servidor en SSR, navegador
 * en cliente) sin fijar `timeZone` explícitamente. Es una característica
 * pre-existente de toda la app, no algo introducido en esta fase.
 */
export function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(dateString)
  );
}

export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "HOY" / "MAÑANA" / fecha formateada en mayúsculas, para encabezados de grupo. */
export function dayGroupLabel(dateIso: string): string {
  const target = new Date(dateIso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return "HOY";
  if (diffDays === 1) return "MAÑANA";
  return formatDate(dateIso).toUpperCase();
}

export interface DayGroup<T> {
  label: string;
  items: T[];
}

/**
 * Agrupa una lista ya ordenada cronológicamente (ascendente) por día
 * calendario local — no reordena: si la entrada no viene ordenada, los
 * grupos tampoco saldrán en orden. `getMyCalendar()` (src/lib/actions/
 * calendar.ts) ya ordena por `scheduled_start_at` ascendente.
 */
export function groupByDay<T>(
  items: T[],
  getIso: (item: T) => string | null
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const iso = getIso(item);
    if (!iso) continue;
    const key = new Date(iso).toDateString();
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ label: dayGroupLabel(iso), items: [item] });
    } else {
      groups[existingIndex].items.push(item);
    }
  }

  return groups;
}

/**
 * Etiquetas indexadas por el valor real de `day_of_week` (0051:
 * `check (day_of_week between 0 and 6)`) — mismo convenio que
 * `Date.prototype.getDay()`/Postgres `EXTRACT(DOW ...)`: 0=domingo.
 */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** Orden de presentación semana-Perú (lunes a domingo) — valores de `day_of_week`, no índices. */
export const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
