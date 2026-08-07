import type { UserRole } from "@/lib/types";

export interface CanShowApplyButtonParams {
  viewerRole: UserRole | null;
  isOwner: boolean;
}

/**
 * Decide si el botón "Postular" debe aparecer — mismo criterio que ya
 * exige la sección real de postulación en /jobs/[id]
 * (`profile?.role === "worker" && !isOwner`): visible para invitados (sin
 * perfil aún — el flujo real los manda a /login) y para workers; oculto
 * para el dueño del trabajo y para cualquier usuario autenticado que no
 * esté en modo worker (empleador o admin) — antes de esto, JobCardActions
 * solo miraba isOwner, así que un empleador veía "Postular" en trabajos
 * ajenos y el click lo llevaba a una página sin formulario de postulación.
 */
export function canShowApplyButton({ viewerRole, isOwner }: CanShowApplyButtonParams): boolean {
  if (isOwner) return false;
  if (viewerRole === null) return true;
  return viewerRole === "worker";
}
