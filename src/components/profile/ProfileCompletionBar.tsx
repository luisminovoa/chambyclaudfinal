"use client";

import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

interface CheckItem {
  label: string;
  points: number;
  done: boolean;
}

interface ProfileCompletionBarProps {
  percentage: number;
  items: CheckItem[];
}

export function ProfileCompletionBar({
  percentage,
  items,
}: ProfileCompletionBarProps) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Perfil completado</p>
        <span
          className={cn(
            "text-lg font-extrabold",
            percentage >= 80
              ? "text-success-600"
              : percentage >= 50
                ? "text-warning-600"
                : "text-danger-500"
          )}
        >
          {percentage}%
        </span>
      </div>
      <Progress value={percentage} label="Completitud del perfil" />
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between text-xs">
            <span
              className={cn(
                "flex items-center gap-2",
                item.done ? "text-ink" : "text-ink-muted"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                  item.done
                    ? "bg-success-100 text-success-600"
                    : "bg-slate-100 text-slate-400"
                )}
              >
                {item.done ? "✓" : "○"}
              </span>
              {item.label}
            </span>
            <span
              className={cn(
                "font-semibold",
                item.done ? "text-success-600" : "text-slate-400"
              )}
            >
              +{item.points}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
