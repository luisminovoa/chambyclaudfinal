import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, ShieldCheck, Briefcase, FlaskConical } from "lucide-react";

export interface AdminNavTab {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/**
 * Única fuente de las secciones de administración — la reutilizan
 * AdminTabs.tsx (subnav dentro de /admin) y Navbar.tsx (nav de
 * escritorio cuando profile.role === "admin"), para no mantener la
 * misma lista de 5 tabs en dos archivos.
 */
export const ADMIN_NAV_TABS: AdminNavTab[] = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Usuarios", icon: Users },
  { href: "/admin/verifications", label: "Verificaciones", icon: ShieldCheck },
  { href: "/admin/jobs", label: "Trabajos", icon: Briefcase },
  { href: "/admin/beta", label: "Beta", icon: FlaskConical },
];
