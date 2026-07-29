"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, HardHat, Building2, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchRoleAction } from "@/lib/actions/roles";
import type { UserRole } from "@/lib/types";

const ROLE_CONFIG: Record<
  UserRole,
  { label: string; icon: React.ElementType; accent: string; active: string }
> = {
  worker: {
    label: "Trabajador",
    icon: HardHat,
    accent: "text-primary-700",
    active: "bg-primary-50 border-primary-200 text-primary-700",
  },
  employer: {
    label: "Empleador",
    icon: Building2,
    accent: "text-success-700",
    active: "bg-success-50 border-success-200 text-success-700",
  },
  admin: {
    label: "Admin",
    icon: HardHat,
    accent: "text-danger-700",
    active: "bg-danger-50 border-danger-200 text-danger-700",
  },
};

interface RoleSwitcherProps {
  activeRole: UserRole;
  availableRoles: UserRole[];
  /** "nav" = compacto para Navbar; "card" = prominente para dashboards */
  variant?: "nav" | "card";
}

export function RoleSwitcher({
  activeRole,
  availableRoles,
  variant = "card",
}: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const switchable = availableRoles.filter((r) => r !== activeRole);

  if (availableRoles.length <= 1) return null;

  function handleSwitch(role: UserRole) {
    setOpen(false);
    startTransition(async () => {
      const res = await switchRoleAction(role);
      if ("error" in res && res.error) return;
      router.push(
        role === "employer" ? "/dashboard/employer" : "/dashboard/worker"
      );
      router.refresh();
    });
  }

  if (variant === "nav") {
    const cfg = ROLE_CONFIG[activeRole];
    const Icon = cfg.icon;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          disabled={isPending}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95",
            cfg.active
          )}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
          <span>{cfg.label}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                Cambiar modo
              </p>
              {switchable.map((role) => {
                const c = ROLE_CONFIG[role];
                const RIcon = c.icon;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleSwitch(role)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-slate-50 hover:text-ink"
                  >
                    <RIcon className={cn("h-4 w-4", c.accent)} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // variant === "card" — Modo selector prominente para dashboards
  return (
    <div className="card mb-6 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Modo actual
      </p>
      <div className="flex flex-wrap gap-2">
        {availableRoles
          .filter((r) => r !== "admin")
          .map((role) => {
            const cfg = ROLE_CONFIG[role];
            const Icon = cfg.icon;
            const isActive = role === activeRole;

            return (
              <button
                key={role}
                type="button"
                disabled={isActive || isPending}
                onClick={() => handleSwitch(role)}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all",
                  isActive
                    ? cn(cfg.active, "cursor-default shadow-card")
                    : "border-slate-200 text-ink-muted hover:border-slate-300 hover:text-ink"
                )}
              >
                {isPending && role !== activeRole ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {cfg.label}
                {isActive && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
      </div>
      {switchable.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Haz clic en el otro modo para cambiar vista.
        </p>
      )}
    </div>
  );
}
