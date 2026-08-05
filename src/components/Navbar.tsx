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

export async function Navbar() {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  const unreadCount = user ? await getUnreadCount() : 0;

  return (
    <header className="glass sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <LogoLink tone="color" withSlogan />
          <BetaBadge />
        </div>


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
              <PublishChambaButton hasEmployerRole={userRoles.includes("employer")} />
              <NotificationBell userId={user.id} initialUnreadCount={unreadCount} />
              <UserMenu profile={profile} userRoles={userRoles} />
              {/* En móvil, salir sigue accesible arriba (el BottomNav no tiene logout);
                  en desktop ya vive dentro de UserMenu, así que este botón se oculta
                  ahí para no duplicar el control. */}
              <form action={logout} className="sm:hidden">
                <button
                  type="submit"
                  className="btn-ghost !min-h-0 !px-3 !py-2 text-sm"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
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
