import Link from "next/link";
import { LogOut, Plus, Search, ShieldCheck } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { logout } from "@/lib/actions/auth";
import { getUnreadCount } from "@/lib/actions/notifications";
import { LogoLink } from "@/components/brand/Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BetaBadge } from "@/components/beta/BetaBadge";
import { PublishChambaButton } from "@/components/roles/PublishChambaButton";
import { UserMenu } from "@/components/roles/UserMenu";
import { RoleIndicator } from "@/components/roles/RoleIndicator";
import { ADMIN_NAV_TABS } from "@/lib/admin-nav";

export async function Navbar() {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  const unreadCount = user ? await getUnreadCount() : 0;

  return (
    <header className="glass sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <LogoLink tone="color" withSlogan />
          {/* Oculto en móvil: el nuevo RoleIndicator ya ocupa ese espacio
              en la barra superior y es más prioritario que el badge Beta. */}
          <span className="hidden sm:inline-flex">
            <BetaBadge />
          </span>
        </div>


        {/* En escritorio se muestran los enlaces principales; en móvil viven en el BottomNav */}
        <nav className="hidden items-center gap-1 text-sm font-semibold text-ink-muted sm:flex">
          {profile?.role === "admin" ? (
            // Navegación coherente con administración — misma lista de
            // secciones que AdminTabs (src/lib/admin-nav.ts), en vez de
            // los enlaces de trabajador/empleador que no aplican a admin.
            ADMIN_NAV_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-primary-50 hover:text-primary-700"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            ))
          ) : (
            <>
              <Link
                href="/jobs"
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-primary-50 hover:text-primary-700"
              >
                <Search className="h-4 w-4" />
                Buscar trabajos
              </Link>
              {profile?.role === "employer" && (
                <Link
                  href="/jobs/new"
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-primary-50 hover:text-primary-700"
                >
                  <Plus className="h-4 w-4" />
                  Publicar trabajo
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user && profile ? (
            <>
              {profile.role === "admin" ? (
                <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-ink-muted sm:text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary-600" aria-hidden />
                  Administrador
                </span>
              ) : (
                <>
                  <RoleIndicator
                    role={profile.role}
                    hasWorkerRole={userRoles.includes("worker")}
                    hasEmployerRole={userRoles.includes("employer")}
                  />
                  <PublishChambaButton hasEmployerRole={userRoles.includes("employer")} />
                </>
              )}
              <NotificationBell userId={user.id} initialUnreadCount={unreadCount} />
              <UserMenu profile={profile} userRoles={userRoles} />
              {/* En móvil, salir sigue accesible arriba (el BottomNav no tiene logout);
                  en desktop ya vive dentro de UserMenu, así que este botón se oculta
                  ahí para no duplicar el control. */}
              <form action={logout} className="sm:hidden">
                <button
                  type="submit"
                  className="btn-ghost !px-3 !py-2 text-sm"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !px-3 !py-2 text-sm sm:!px-3.5">
                Ingresar
              </Link>
              <Link href="/register" className="btn-primary !px-3.5 !py-2 text-sm sm:!px-4">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
