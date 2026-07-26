import type { Metadata } from "next";
import { AntIllustration } from "@/components/brand/AntIllustration";

export const metadata: Metadata = {
  title: "Sin conexión",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <AntIllustration pose="lost" className="w-44 text-primary-600" />
      <h1 className="mt-6 text-xl font-extrabold tracking-tight text-ink">Sin conexión</h1>
      <p className="mt-2 text-ink-muted">
        La hormiguita no pudo conectarse. Revisa tu internet y vuelve a intentarlo.
      </p>
    </div>
  );
}
