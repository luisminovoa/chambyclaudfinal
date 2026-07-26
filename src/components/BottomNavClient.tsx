"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

interface BottomNavClientProps {
  isLoggedIn: boolean;
  role: UserRole | null;
}

export function BottomNavClient({ isLoggedIn, role }: BottomNavClientProps) {
  const pathname = usePathname();

  const profileHref = isLoggedIn ? (role === "admin" ? "/admin" : "/dashboard") : "/login";
  const publishHref = isLoggedIn ? "/jobs/new" : "/register";

  const tabs = [
    { href: "/", label: "Inicio", icon: Home, exact: true },
    { href: "/jobs", label: "Buscar", icon: Search, exact: false },
    { href: publishHref, label: "Publicar", icon: Plus, center: true, exact: false },
    { href: "/messages", label: "Mensajes", icon: MessageCircle, exact: false },
    { href: profileHref, label: "Perfil", icon: User, exact: false },
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
            return (
              <Link
                key={tab.label}
                href={tab.href}
                aria-label={tab.label}
                className="relative -top-4 flex flex-1 flex-col items-center gap-1"
              >
                <motion.span
                  whileTap={{ scale: 0.9 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow"
                >
                  <tab.icon className="h-6 w-6" strokeWidth={2.25} />
                </motion.span>
                <span className="text-[11px] font-semibold leading-none text-ink-muted">
                  {tab.label}
                </span>
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
                active ? "text-primary-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="absolute inset-x-4 top-1 -z-10 h-8 rounded-full bg-primary-50"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <tab.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 2} />
              <span className="text-[11px] font-semibold leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
