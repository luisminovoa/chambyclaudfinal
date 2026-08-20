import type { LucideIcon } from "lucide-react";
import { Briefcase, Plus, Search } from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface MainNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Única fuente de la navegación principal por MODO ACTIVO (profiles.role)
 * — la reutilizan Navbar.tsx (escritorio), BottomNavClient.tsx (móvil) y
 * UserMenu.tsx ("Mi Perfil"), para no mantener la misma lista de enlaces
 * en tres archivos. Mismo patrón que src/lib/admin-nav.ts.
 *
 * El criterio es el modo activo, no los roles poseídos: un usuario con
 * worker+employer ve solo la experiencia del modo en el que está, nunca
 * las dos mezcladas (docs/DISENO-MULTI-ROL.md — `profiles.role` es "en
 * qué modo estoy", `user_roles` es "qué puedo ser"). La autorización de
 * cada página es un asunto aparte y sí mira los roles poseídos.
 *
 * Admin queda deliberadamente fuera: su navegación de escritorio son las
 * secciones de ADMIN_NAV_TABS (src/lib/admin-nav.ts) y Navbar la resuelve
 * en su propia rama. getMainNavItems() devuelve [] para admin para que
 * ningún enlace de trabajador/empleador se cuele ahí por accidente.
 */
const WORKER_NAV_ITEMS: MainNavItem[] = [
  { href: "/jobs", label: "Buscar trabajos", icon: Search },
];

/**
 * "Buscar trabajadores" (/workers) NO está aquí a propósito: esa ruta
 * todavía no existe. Se agrega junto con el directorio, no antes — un
 * enlace a una ruta inexistente es peor que no tener el enlace.
 */
const EMPLOYER_NAV_ITEMS: MainNavItem[] = [
  { href: "/dashboard/employer", label: "Mis publicaciones", icon: Briefcase },
  { href: "/jobs/new", label: "Publicar trabajo", icon: Plus },
];

/** Navegación de escritorio para el modo activo. Admin: [] (ver arriba). */
export function getMainNavItems(role: UserRole | null): MainNavItem[] {
  if (role === "admin") return [];
  if (role === "employer") return EMPLOYER_NAV_ITEMS;
  // worker y visitante sin sesión comparten la navegación de trabajador:
  // un invitado que llega a la home viene a buscar trabajos.
  return WORKER_NAV_ITEMS;
}

/**
 * Segunda pestaña del BottomNav (móvil). Etiquetas más cortas que en
 * escritorio porque el tab mide ~1/5 del ancho de pantalla.
 *
 * Admin conserva "Buscar" → /jobs, que es su comportamiento actual: el
 * BottomNav nunca tuvo una rama de administración y esta fase no la
 * introduce.
 */
export function getBrowseTab(role: UserRole | null): MainNavItem {
  if (role === "employer") {
    return { href: "/dashboard/employer", label: "Publicaciones", icon: Briefcase };
  }
  return { href: "/jobs", label: "Buscar", icon: Search };
}

/**
 * Destino de "Mi Perfil" según el modo activo. Antes estaba fijo en
 * /dashboard/worker/profile, lo que dejaba a una cuenta employer pura
 * (sin rol worker en user_roles) rebotando: /dashboard/worker/profile
 * redirige a /dashboard, que a su vez redirige a /dashboard/employer —
 * el usuario nunca llegaba a su propio perfil.
 *
 * Admin mantiene el destino de trabajador, su comportamiento actual.
 */
export function getProfileHref(role: UserRole | null): string {
  return role === "employer" ? "/dashboard/employer/profile" : "/dashboard/worker/profile";
}
