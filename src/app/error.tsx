"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[global error boundary]", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-xl font-bold text-ink">Algo salió mal</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Ocurrió un error inesperado. Puede ser un problema de red temporal.
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-6">
        <RefreshCcw className="h-4 w-4" />
        Intentar de nuevo
      </button>
    </div>
  );
}
