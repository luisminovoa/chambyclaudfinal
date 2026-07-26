import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary-50 text-primary-600",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  neutral: "bg-slate-100 text-slate-600",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: keyof typeof tones;
  hint?: string;
}

export function StatCard({ icon: Icon, label, value, tone = "primary", hint }: StatCardProps) {
  return (
    <div className="card card-hover p-5">
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", tones[tone])}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-ink-muted">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
