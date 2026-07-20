import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

function TabLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 active:text-primary-700"
    >
      {icon}
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </Link>
  );
}

export async function BottomNav() {
  const { user, profile } = await getCurrentUserAndProfile();

  // Acción central: cambia según el rol para mostrar siempre lo más útil
  let centerTab = { href: "/login", label: "Ingresar", icon: <UserIcon /> };
  if (profile?.role === "employer") {
    centerTab = { href: "/jobs/new", label: "Publicar", icon: <PlusIcon /> };
  } else if (profile?.role === "worker") {
    centerTab = { href: "/dashboard/worker", label: "Mis postulaciones", icon: <BriefcaseIcon /> };
  } else if (profile?.role === "admin") {
    centerTab = { href: "/admin", label: "Admin", icon: <ShieldIcon /> };
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <TabLink href="/" label="Inicio" icon={<HomeIcon />} />
      <TabLink href="/jobs" label="Buscar" icon={<SearchIcon />} />
      <TabLink href={centerTab.href} label={centerTab.label} icon={centerTab.icon} />
      <TabLink href={user ? "/dashboard" : "/login"} label="Perfil" icon={<UserIcon />} />
    </nav>
  );
}
