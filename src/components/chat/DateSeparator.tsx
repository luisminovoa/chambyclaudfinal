import { isToday, isYesterday, format } from "date-fns";
import { es } from "date-fns/locale";

export function DateSeparator({ date }: { date: Date }) {
  const label = isToday(date)
    ? "Hoy"
    : isYesterday(date)
      ? "Ayer"
      : format(date, "d 'de' MMMM 'de' yyyy", { locale: es });

  return (
    <div className="flex items-center gap-3 py-3" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}
