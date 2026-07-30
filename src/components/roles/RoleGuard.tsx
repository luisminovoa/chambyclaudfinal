"use client";

import type { UserRole } from "@/lib/types";

interface RoleGuardProps {
  /** Rol requerido para mostrar el contenido */
  role: UserRole;
  /** Roles que posee el usuario actual (de userRoles, no de profile.role) */
  userRoles: UserRole[];
  children: React.ReactNode;
  /** Contenido alternativo si el usuario no tiene el rol */
  fallback?: React.ReactNode;
}

/**
 * Muestra `children` sólo si `userRoles` incluye el `role` requerido.
 * Útil para proteger secciones de UI sin hacer redirects.
 */
export function RoleGuard({ role, userRoles, children, fallback = null }: RoleGuardProps) {
  if (!userRoles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
