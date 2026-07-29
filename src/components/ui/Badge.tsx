import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-slate-100 text-slate-600",
        primary: "bg-primary-50 text-primary-700",
        success: "bg-success-50 text-success-700",
        warning: "bg-warning-50 text-warning-700",
        danger: "bg-danger-50 text-danger-700",
        info: "bg-sky-50 text-sky-700",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function jobStatusTone(status: string): VariantProps<typeof badgeVariants>["tone"] {
  const tones: Record<string, VariantProps<typeof badgeVariants>["tone"]> = {
    borrador: "warning",
    abierto: "success",
    en_progreso: "info",
    completado: "neutral",
    cancelado: "danger",
    pendiente: "warning",
    aceptado: "success",
    rechazado: "danger",
    retirado: "neutral",
  };
  return tones[status] ?? "neutral";
}
