import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-50 text-primary-600">
        <Compass className="h-10 w-10" strokeWidth={1.5} />
      </span>
      <p className="mt-6 bg-brand-gradient bg-clip-text text-7xl font-extrabold tracking-tight text-transparent">
        404
      </p>
      <h1 className="mt-3 text-xl font-extrabold tracking-tight text-ink">Página no encontrada</h1>
      <p className="mt-2 text-ink-muted">Lo que buscas no existe o fue movido.</p>
      <Link href="/" className="btn-primary mt-8">
        Volver al inicio
      </Link>
    </div>
  );
}
