import { HardHat, Building2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const ROLE_CONFIG: Record<
  UserRole,
  { label: string; icon: React.ElementType; classes: string }
> = {
  worker: {
    label: "Trabajador",
    icon: HardHat,
    classes: "bg-primary-50 text-primary-700 border-primary-200",
  },
  employer: {
    label: "Empleador",
    icon: Building2,
    classes: "bg-success-50 text-success-700 border-success-200",
  },
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    classes: "bg-danger-50 text-danger-700 border-danger-200",
  },
};

interface RoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md";
  className?: string;
}

export function RoleBadge({ role, size = "md", className }: RoleBadgeProps) {
  const cfg = ROLE_CONFIG[role];
  const Icon = cfg.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        cfg.classes,
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      {cfg.label}
    </span>
  );
}
