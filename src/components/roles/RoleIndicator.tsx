"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useActivateRole } from "@/components/roles/use-activate-role";
import { ROLE_META, getOwnedRoles } from "@/components/roles/role-meta";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

interface RoleIndicatorProps {
  role: UserRole;
  hasWorkerRole: boolean;
  hasEmployerRole: boolean;
  hasAdminRole: boolean;
}

/**
 * Indicador de "modo activo" (Trabajador/Empleador/Administrador) siempre
 * visible en el Navbar, en todos los viewports. Reutiliza useActivateRole()
 * (mismo hook que UserMenu/BottomNav/BackToWorkerButton) para el switch —
 * ningún flujo de cambio de rol nuevo.
 *
 * Administrador solo aparece en la lista cuando `hasAdminRole` es true
 * (la cuenta ya posee ese permiso en user_roles) — nunca se ofrece como
 * auto-servicio, a diferencia de Empleador. switchRoleAction() vuelve a
 * validar esto server-side de todos modos: aunque alguien forzara el
 * click sin poseer el rol, la Server Action lo rechaza igual.
 *
 * Corrige el bug "no puedo volver a Administrador tras cambiar de rol":
 * antes este componente hacía `if (role !== "worker" && role !== "employer")
 * return null`, así que en modo admin no existía NINGÚN control para
 * volver a admin una vez que se cambiaba a Trabajador/Empleador.
 */
export function RoleIndicator({ role, hasWorkerRole, hasEmployerRole, hasAdminRole }: RoleIndicatorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toWorker = useActivateRole("worker", hasWorkerRole, ROLE_META.worker.redirectTo);
  const toEmployer = useActivateRole("employer", hasEmployerRole, ROLE_META.employer.redirectTo);
  const toAdmin = useActivateRole("admin", hasAdminRole, ROLE_META.admin.redirectTo);
  const activators = { worker: toWorker, employer: toEmployer, admin: toAdmin };
  const owned: Record<UserRole, boolean> = {
    worker: hasWorkerRole,
    employer: hasEmployerRole,
    admin: hasAdminRole,
  };

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const meta = ROLE_META[role];
  const ownedRoles = getOwnedRoles(owned);
  const canSwitch = ownedRoles.length > 1;
  const isPending = toWorker.isPending || toEmployer.isPending || toAdmin.isPending;

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
      {meta.icon ? (
        <meta.icon className="h-3.5 w-3.5 shrink-0 text-primary-600" aria-hidden />
      ) : (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
      )}
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
          className="card absolute right-0 top-full z-50 mt-2 w-48 origin-top-right p-1.5"
        >
          {ownedRoles.map((r) => {
            const m = ROLE_META[r];
            return (
              <button
                key={r}
                type="button"
                role="menuitem"
                disabled={isPending || role === r}
                onClick={() => {
                  setOpen(false);
                  activators[r].activate();
                }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
              >
                {m.icon ? (
                  <m.icon className="h-3.5 w-3.5 text-primary-600" aria-hidden />
                ) : (
                  <span className={cn("h-2 w-2 rounded-full", m.dot)} aria-hidden />
                )}
                {m.label}
                {role === r && <span className="ml-auto text-xs text-primary-600">Activo</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
