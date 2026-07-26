import Link from "next/link";
import { AntIllustration } from "@/components/brand/AntIllustration";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <AntIllustration pose="lost" className="w-44 text-primary-600" />
      <p className="mt-4 bg-brand-gradient bg-clip-text text-7xl font-extrabold tracking-tight text-transparent">
        404
      </p>
      <h1 className="mt-3 text-xl font-extrabold tracking-tight text-ink">
        Ups... esta chamba no existe
      </h1>
      <p className="mt-2 text-ink-muted">
        La hormiguita buscó por todos lados y no encontró esta página.
      </p>
      <Link href="/" className="btn-primary mt-8">
        Volver al inicio
      </Link>
    </div>
  );
}
