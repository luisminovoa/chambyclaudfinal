"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useActivateRole } from "@/components/roles/use-activate-role";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const ROLE_META: Record<"worker" | "employer", { label: string; dot: string; redirectTo: string }> = {
  worker: { label: "Trabajador", dot: "bg-primary-500", redirectTo: "/dashboard/worker" },
  employer: { label: "Empleador", dot: "bg-sky-500", redirectTo: "/dashboard/employer" },
};

interface RoleIndicatorProps {
  role: UserRole;
  hasWorkerRole: boolean;
  hasEmployerRole: boolean;
}

/**
 * Indicador de "modo activo" (Trabajador/Empleador) siempre visible en el
 * Navbar — antes no existía ningún indicador de rol fuera del menú de
 * usuario (solo visible en escritorio), así que un usuario con ambos
 * roles no tenía forma de saber en qué modo estaba sin abrir "Publicar
 * Chamba" o navegar al dashboard. Reutiliza useActivateRole() (mismo
 * hook que UserMenu/BottomNav/BackToWorkerButton) para el switch —
 * ningún flujo de cambio de rol nuevo.
 */
export function RoleIndicator({ role, hasWorkerRole, hasEmployerRole }: RoleIndicatorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toWorker = useActivateRole("worker", hasWorkerRole, ROLE_META.worker.redirectTo);
  const toEmployer = useActivateRole("employer", hasEmployerRole, ROLE_META.employer.redirectTo);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Admin no tiene modo worker/employer que alternar.
  if (role !== "worker" && role !== "employer") return null;

  const meta = ROLE_META[role];
  const canSwitch = hasWorkerRole && hasEmployerRole;
  const isPending = toWorker.isPending || toEmployer.isPending;

  const trigger = (
    <button
      type="button"
      onClick={() => canSwitch && setOpen((v) => !v)}
      aria-haspopup={canSwitch ? "menu" : undefined}
      aria-expanded={canSwitch ? open : undefined}
      disabled={isPending}
      className={cn(
        "flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-ink-muted transition-colors disabled:opacity-60 sm:text-xs",
        canSwitch && "hover:bg-slate-50"
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
      {canSwitch && <ChevronDown className="h-3 w-3" />}
    </button>
  );

  if (!canSwitch) return trigger;

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          className="card absolute right-0 top-full z-50 mt-2 w-44 origin-top-right p-1.5"
        >
          {(["worker", "employer"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              disabled={isPending || role === r}
              onClick={() => {
                setOpen(false);
                (r === "worker" ? toWorker : toEmployer).activate();
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
            >
              <span className={cn("h-2 w-2 rounded-full", ROLE_META[r].dot)} aria-hidden />
              {ROLE_META[r].label}
              {role === r && <span className="ml-auto text-xs text-primary-600">Activo</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
