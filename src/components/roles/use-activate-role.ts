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
 *
 * router.refresh() además de router.push(): switchRoleAction() ya hace
 * revalidatePath("/", "layout") server-side, pero eso invalida la caché
 * de Next para la próxima vez que se pida esa ruta — no garantiza que la
 * navegación de router.push() dispare ese refetch en todos los runtimes
 * (p.ej. detrás de un proxy/CDN como el de Netlify, donde una
 * navegación "soft" puede reutilizar el Router Cache del cliente si el
 * refresh no se fuerza explícitamente). router.refresh() vuelve a pedir
 * los Server Components del árbol actual sin caché, así que el Navbar/
 * RoleIndicator quedan garantizados a reflejar el profiles.role recién
 * escrito, sin depender de la propagación de la invalidación.
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
      router.refresh();
    });
  }

  return { activate, isPending };
}
