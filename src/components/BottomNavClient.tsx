"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivateRole } from "@/components/roles/use-activate-role";
import type { UserRole } from "@/lib/types";

interface BottomNavClientProps {
  isLoggedIn: boolean;
  role: UserRole | null;
  hasEmployerRole?: boolean;
  messagesUnreadCount?: number;
}

export function BottomNavClient({
  isLoggedIn,
  role,
  hasEmployerRole = false,
  messagesUnreadCount = 0,
}: BottomNavClientProps) {
  const pathname = usePathname();
  // Único punto de entrada a "Publicar Chamba" en mobile — no hay menú
  // hamburguesa en esta app, el tab central del BottomNav ya es
  // ícono-solo por diseño, así que cumple el mismo requisito.
  const publish = useActivateRole("employer", hasEmployerRole, "/jobs/new");

  const profileHref = isLoggedIn ? (role === "admin" ? "/admin" : "/dashboard") : "/login";
  // Un invitado que quiere publicar vuelve al formulario justo después de registrarse
  const publishHref = isLoggedIn ? "/jobs/new" : "/register?next=/jobs/new";

  const tabs = [
    { href: "/", label: "Inicio", icon: Home, exact: true, badge: 0 },
    { href: "/jobs", label: "Buscar", icon: Search, exact: false, badge: 0 },
    { href: publishHref, label: "Publicar", icon: Plus, center: true, exact: false, badge: 0 },
    { href: "/messages", label: "Mensajes", icon: MessageCircle, exact: false, badge: messagesUnreadCount },
    { href: profileHref, label: "Perfil", icon: User, exact: false, badge: 0 },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/85 backdrop-blur-xl sm:hidden"
    >
      <div className="flex items-end">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          if (tab.center) {
            const centerContent = (
              <>
                <motion.span
                  whileTap={{ scale: 0.9 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow"
                >
                  <tab.icon className="h-6 w-6" strokeWidth={2.25} />
                </motion.span>
                <span className="text-[11px] font-semibold leading-none text-ink-muted">
                  {tab.label}
                </span>
              </>
            );

            // Logueado: agrega/activa employer y navega — mismo flujo que
            // el botón del Navbar. Invitado: sin sesión que activar, solo
            // enlaza al registro (comportamiento sin cambios).
            if (isLoggedIn) {
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={publish.activate}
                  disabled={publish.isPending}
                  aria-label={tab.label}
                  className="relative -top-4 flex flex-1 flex-col items-center gap-1 disabled:opacity-70"
                >
                  {centerContent}
                </button>
              );
            }

            return (
              <Link
                key={tab.label}
                href={tab.href}
                aria-label={tab.label}
                className="relative -top-4 flex flex-1 flex-col items-center gap-1"
              >
                {centerContent}
              </Link>
            );
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-200",
                active ? "text-primary-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="absolute inset-x-4 top-1 -z-10 h-8 rounded-full bg-primary-50"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">
                <tab.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 2} />
                {tab.badge > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-0.5 text-[9px] font-bold text-white leading-none"
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-semibold leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
