"use client";

import { CheckCircle2 } from "lucide-react";
import { useActivateRole } from "@/components/roles/use-activate-role";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const ROLE_META: Record<"worker" | "employer", { label: string; dot: string; redirectTo: string }> = {
  worker: { label: "Trabajador", dot: "bg-primary-500", redirectTo: "/dashboard/worker" },
  employer: { label: "Empleador", dot: "bg-sky-500", redirectTo: "/dashboard/employer" },
};

interface RoleSwitcherCardProps {
  role: UserRole;
  hasWorkerRole: boolean;
  hasEmployerRole: boolean;
}

/**
 * Bloque "Mis roles" en la pantalla de perfil (móvil y escritorio) — antes
 * el único lugar para cambiar de modo eran el menú de usuario (oculto en
 * móvil) o el tab "+" del BottomNav. Misma lógica de switch que
 * RoleIndicator (Navbar) vía useActivateRole(), presentación distinta
 * (card estática en vez de dropdown) porque el contexto es de página
 * completa, no de barra superior.
 */
export function RoleSwitcherCard({ role, hasWorkerRole, hasEmployerRole }: RoleSwitcherCardProps) {
  const toWorker = useActivateRole("worker", hasWorkerRole, ROLE_META.worker.redirectTo);
  const toEmployer = useActivateRole("employer", hasEmployerRole, ROLE_META.employer.redirectTo);

  // Admin no tiene modo worker/employer que alternar.
  if (role !== "worker" && role !== "employer") return null;

  const ownedRoles = (["worker", "employer"] as const).filter(
    (r) => (r === "worker" ? hasWorkerRole : hasEmployerRole)
  );
  const isPending = toWorker.isPending || toEmployer.isPending;

  return (
    <div className="card mb-6 p-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Mis roles</h2>
      <div className="space-y-2">
        {ownedRoles.map((r) => {
          const meta = ROLE_META[r];
          const isActive = role === r;
          return (
            <button
              key={r}
              type="button"
              disabled={isPending || isActive}
              onClick={() => (r === "worker" ? toWorker : toEmployer).activate()}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors disabled:cursor-default",
                isActive
                  ? "border-primary-200 bg-primary-50 text-primary-700"
                  : "border-slate-200 bg-white text-ink-muted hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
              {meta.label}
              {isActive ? (
                <span className="ml-auto flex items-center gap-1 text-xs text-primary-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Activo
                </span>
              ) : (
                <span className="ml-auto text-xs font-bold text-primary-600">Cambiar</span>
              )}
            </button>
          );
        })}
        {!hasEmployerRole && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => toEmployer.activate()}
            className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink-muted transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default"
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", ROLE_META.employer.dot)} aria-hidden />
            Empezar a publicar como empleador
          </button>
        )}
      </div>
    </div>
  );
}
