"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HardHat,
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { enableEmployerRole, disableEmployerRole } from "@/lib/actions/roles";
import { useToast } from "@/components/ui/Toaster";

interface RolesPanelProps {
  hasWorker: boolean;
  hasEmployer: boolean;
}

export function RolesPanel({ hasWorker, hasEmployer }: RolesPanelProps) {
  const [employerActive, setEmployerActive] = useState(hasEmployer);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function toggleEmployer() {
    startTransition(async () => {
      const res = employerActive
        ? await disableEmployerRole()
        : await enableEmployerRole();

      if (res.error) {
        toast(res.error, "error");
        return;
      }
      setEmployerActive((p) => !p);
      toast(
        employerActive
          ? "Rol de empleador desactivado."
          : "Rol de empleador activado. Ya puedes publicar chambas.",
        "success"
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Worker role — siempre activo, no se puede desactivar */}
      <div
        className={cn(
          "card flex items-start gap-4 p-5",
          hasWorker ? "border-primary-200 bg-primary-50" : ""
        )}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-100">
          <HardHat className="h-6 w-6 text-primary-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-ink">Trabajador</h3>
            {hasWorker ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-primary-600">
                <CheckCircle2 className="h-4 w-4" />
                Activo
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Circle className="h-4 w-4" />
                Inactivo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Busca chambas, postúlate, construye tu perfil profesional y recibe
            calificaciones de los empleadores.
          </p>
          {hasWorker && (
            <p className="mt-2 text-xs text-primary-600">
              Este rol es el base y no puede desactivarse.
            </p>
          )}
        </div>
      </div>

      {/* Employer role — activable/desactivable */}
      <div
        className={cn(
          "card flex items-start gap-4 p-5 transition-colors",
          employerActive ? "border-success-200 bg-success-50" : "opacity-80"
        )}
      >
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            employerActive ? "bg-success-100" : "bg-slate-100"
          )}
        >
          <Building2
            className={cn("h-6 w-6", employerActive ? "text-success-600" : "text-slate-400")}
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-ink">Empleador</h3>
            <button
              type="button"
              onClick={toggleEmployer}
              disabled={isPending}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                employerActive
                  ? "bg-slate-100 text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                  : "btn-primary !min-h-0 !px-3 !py-1.5 !text-xs"
              )}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : employerActive ? (
                "Desactivar"
              ) : (
                "Activar"
              )}
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Publica chambas, gestiona postulantes, contrata trabajadores y
            califica su desempeño.
          </p>
          {!employerActive && (
            <p className="mt-2 text-xs text-ink-muted">
              Actívalo y podrás acceder al panel de empleador en cualquier momento.
            </p>
          )}
          {employerActive && (
            <p className="mt-2 text-xs text-success-600">
              Puedes cambiar entre modos desde el dashboard.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-ink-muted">
        <p className="font-semibold text-ink">¿Cómo funcionan los roles?</p>
        <p className="mt-1 leading-relaxed">
          Puedes ser trabajador y empleador con la misma cuenta. El{" "}
          <strong>modo activo</strong> determina qué ves en tu dashboard. Puedes
          cambiar de modo en cualquier momento desde el selector en tu panel
          principal — sin cerrar sesión.
        </p>
      </div>
    </div>
  );
}
