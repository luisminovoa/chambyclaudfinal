import Link from "next/link";

export function Footer() {
  return (
    <footer className="hidden border-t border-slate-100 bg-white sm:block">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient text-base font-extrabold text-white">
              C
            </span>
            <span className="text-base font-extrabold tracking-tight text-ink">Chamby</span>
          </Link>
          <p className="text-sm text-ink-muted">
            © {new Date().getFullYear()} Chamby. Conectando talento con oportunidades en el Perú.
          </p>
          <div className="flex gap-6 text-sm font-medium text-ink-muted">
            <span className="cursor-pointer transition-colors hover:text-primary-600">Términos</span>
            <span className="cursor-pointer transition-colors hover:text-primary-600">Privacidad</span>
            <span className="cursor-pointer transition-colors hover:text-primary-600">Ayuda</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
