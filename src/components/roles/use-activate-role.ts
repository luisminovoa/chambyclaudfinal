"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { enableEmployerRole, switchRoleAction } from "@/lib/actions/roles";
import type { UserRole } from "@/lib/types";

/**
 * Cambia el modo activo del usuario a `targetRole` y navega a `redirectTo`.
 * Si targetRole es "employer" y el usuario todavía no lo posee, lo agrega
 * primero (enableEmployerRole) sin tocar el rol worker existente — nunca
 * reemplaza un rol por otro, solo agrega y cambia el modo activo.
 *
 * Único punto de esta lógica: lo reutilizan el botón "+ Publicar Chamba"
 * del Navbar, el tab central del BottomNav y "Panel Trabajador"/
 * "Panel Empleador" del menú de usuario.
 */
export function useActivateRole(
  targetRole: UserRole,
  hasTargetRole: boolean,
  redirectTo: string
) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function activate() {
    startTransition(async () => {
      if (targetRole === "employer" && !hasTargetRole) {
        const enableResult = await enableEmployerRole();
        if ("error" in enableResult) {
          toast(enableResult.error, "error");
          return;
        }
      }

      const switchResult = await switchRoleAction(targetRole);
      if ("error" in switchResult) {
        toast(switchResult.error, "error");
        return;
      }

      router.push(redirectTo);
    });
  }

  return { activate, isPending };
}
