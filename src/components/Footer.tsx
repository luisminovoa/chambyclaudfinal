import Link from "next/link";
import { LogoLink } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="hidden border-t border-slate-100 bg-white sm:block">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <LogoLink tone="color" withSlogan />
          <p className="text-sm text-ink-muted">
            © {new Date().getFullYear()} Chamby. Conectando talento con oportunidades en el Perú.
          </p>
          <div className="flex gap-6 text-sm font-medium text-ink-muted">
            <Link href="/terminos" className="transition-colors hover:text-primary-600">
              Términos
            </Link>
            <Link href="/privacidad" className="transition-colors hover:text-primary-600">
              Privacidad
            </Link>
            {/* "Ayuda" queda sin enlace hasta que exista un centro de ayuda */}
            <span>Ayuda</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
