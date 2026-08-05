"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, LogOut, User, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useActivateRole } from "@/components/roles/use-activate-role";
import { logout } from "@/lib/actions/auth";
import type { Profile, UserRole } from "@/lib/types";

interface UserMenuProps {
  profile: Profile;
  userRoles: UserRole[];
}

/**
 * Menú del avatar: Mi Perfil, Panel Trabajador, Panel Empleador, Publicar
 * Chamba, Cerrar sesión. Reemplaza el link directo a /dashboard — ahora
 * cambiar de modo no requiere pasar por el perfil.
 *
 * "Configuración" (parte del pedido original) no está en este menú: no
 * existe ninguna página /dashboard/settings en el proyecto y crearla es
 * una funcionalidad nueva fuera del alcance de docs/DISENO-MULTI-ROL.md
 * (§6, excluida explícitamente). Se deja fuera hasta que se proponga por
 * separado.
 */
export function UserMenu({ profile, userRoles }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasEmployerRole = userRoles.includes("employer");

  const toWorker = useActivateRole("worker", true, "/dashboard/worker");
  const toEmployer = useActivateRole("employer", hasEmployerRole, "/dashboard/employer");
  const toPublish = useActivateRole("employer", hasEmployerRole, "/jobs/new");

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 transition-colors duration-200 hover:bg-slate-100"
      >
        <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" />
        <span className="text-sm font-semibold text-slate-700">
          {profile.full_name.split(" ")[0]}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="card absolute right-0 top-full z-50 mt-2 w-56 origin-top-right p-1.5"
        >
          <Link
            href="/dashboard/worker/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700"
          >
            <User className="h-4 w-4" />
            Mi Perfil
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={toWorker.isPending}
            onClick={() => {
              setOpen(false);
              toWorker.activate();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:opacity-60"
          >
            <UserCog className="h-4 w-4" />
            Panel Trabajador
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={toEmployer.isPending}
            onClick={() => {
              setOpen(false);
              toEmployer.activate();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:opacity-60"
          >
            <Briefcase className="h-4 w-4" />
            Panel Empleador
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={toPublish.isPending}
            onClick={() => {
              setOpen(false);
              toPublish.activate();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:opacity-60"
          >
            <Briefcase className="h-4 w-4" />
            Publicar Chamba
          </button>

          <div className="my-1 border-t border-slate-100" />

          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
