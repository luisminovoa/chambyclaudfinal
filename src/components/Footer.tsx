export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} Chamby. Conectando talento con oportunidades.</p>
          <div className="flex gap-4">
            <span>Términos</span>
            <span>Privacidad</span>
            <span>Ayuda</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
