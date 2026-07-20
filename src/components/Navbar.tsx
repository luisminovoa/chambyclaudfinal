import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { logout } from "@/lib/actions/auth";
import { initials } from "@/lib/utils";

export async function Navbar() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-lg font-bold text-white">
            C
          </span>
          <span className="text-lg font-bold text-slate-900">Chamby</span>
        </Link>

        {/* En escritorio se muestran los enlaces principales; en móvil viven en el BottomNav */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
          <Link href="/jobs" className="hover:text-primary-700">
            Buscar trabajos
          </Link>
          {profile?.role === "employer" && (
            <Link href="/jobs/new" className="hover:text-primary-700">
              Publicar trabajo
            </Link>
          )}
          {profile?.role === "admin" && (
            <Link href="/admin" className="hover:text-primary-700">
              Administración
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user && profile ? (
            <>
              <Link
                href="/dashboard"
                className="hidden items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 sm:flex"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                  {initials(profile.full_name)}
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {profile.full_name.split(" ")[0]}
                </span>
              </Link>
              {/* En móvil, salir sigue accesible arriba (el BottomNav no tiene logout) */}
              <form action={logout}>
                <button type="submit" className="btn-ghost !px-3 !py-1.5 text-sm">
                  Salir
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden !px-3 !py-1.5 text-sm sm:inline-flex">
                Ingresar
              </Link>
              <Link href="/register" className="btn-primary !px-3 !py-1.5 text-sm">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
