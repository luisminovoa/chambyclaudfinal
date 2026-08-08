import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface RoleMeta {
  label: string;
  dot?: string;
  icon?: LucideIcon;
  redirectTo: string;
}

/**
 * Única fuente de label/color/destino por rol — antes duplicada de forma
 * idéntica en RoleIndicator.tsx y RoleSwitcherCard.tsx (cada uno con su
 * propio ROLE_META worker/employer). Se extrae aquí al agregar admin como
 * tercer rol seleccionable, para no arriesgar que ambos selectores queden
 * con textos/colores distintos para el mismo rol.
 */
export const ROLE_META: Record<UserRole, RoleMeta> = {
  worker: { label: "Trabajador", dot: "bg-primary-500", redirectTo: "/dashboard/worker" },
  employer: { label: "Empleador", dot: "bg-sky-500", redirectTo: "/dashboard/employer" },
  admin: { label: "Administrador", icon: ShieldCheck, redirectTo: "/admin" },
};

/**
 * Orden fijo en los selectores de rol (RoleIndicator, RoleSwitcherCard):
 * Trabajador, Empleador, Administrador — filtrado a los roles que la
 * cuenta realmente posee. Administrador solo aparece en esta lista si
 * `hasAdminRole` es true; nunca se ofrece como auto-servicio.
 */
export const ROLE_SWITCH_ORDER: readonly UserRole[] = ["worker", "employer", "admin"];
