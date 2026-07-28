import Link from "next/link";
import { LogOut, Plus, Search, ShieldCheck } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { logout } from "@/lib/actions/auth";
import { getUnreadCount } from "@/lib/actions/notifications";
import { Avatar } from "@/components/ui/Avatar";
import { LogoLink } from "@/components/brand/Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export async function Navbar() {
  const { user, profile } = await getCurrentUserAndProfile();
  const unreadCount = user ? await getUnreadCount() : 0;

  return (
    <header className="glass sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <LogoLink tone="color" withSlogan />


        {/* En escritorio se muestran los enlaces principales; en móvil viven en el BottomNav */}
        <nav className="hidden items-center gap-1 text-sm font-semibold text-ink-muted sm:flex">
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
          {profile?.role === "admin" && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-primary-50 hover:text-primary-700"
            >
              <ShieldCheck className="h-4 w-4" />
              Administración
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user && profile ? (
            <>
              <NotificationBell userId={user.id} initialUnreadCount={unreadCount} />
              <Link
                href="/dashboard"
                className="hidden items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 transition-colors duration-200 hover:bg-slate-100 sm:flex"
              >
                <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" />
                <span className="text-sm font-semibold text-slate-700">
                  {profile.full_name.split(" ")[0]}
                </span>
              </Link>
              {/* En móvil, salir sigue accesible arriba (el BottomNav no tiene logout) */}
              <form action={logout}>
                <button
                  type="submit"
                  className="btn-ghost !min-h-0 !px-3 !py-2 text-sm"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden !min-h-0 !px-3.5 !py-2 text-sm sm:inline-flex">
                Ingresar
              </Link>
              <Link href="/register" className="btn-primary !min-h-0 !px-4 !py-2 text-sm">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
