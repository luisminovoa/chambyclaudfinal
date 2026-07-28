"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, Briefcase, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Usuarios", icon: Users, exact: false },
  { href: "/admin/jobs", label: "Trabajos", icon: Briefcase, exact: false },
  { href: "/admin/beta", label: "Beta", icon: FlaskConical, exact: false },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de administración" className="no-scrollbar flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-4 py-3.5 text-sm font-semibold transition-colors duration-200",
              active ? "text-primary-600" : "text-ink-muted hover:text-ink"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {active && (
              <motion.span
                layoutId="admin-tab-indicator"
                className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-gradient"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
