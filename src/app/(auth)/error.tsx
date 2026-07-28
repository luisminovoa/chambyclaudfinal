"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { LogoCompacto } from "@/components/brand/Logo";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Network failures log as non-critical; suppress unrecognized ones
    if (process.env.NODE_ENV === "development") {
      console.error("[auth error boundary]", error);
    }
  }, [error]);

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
      <LogoCompacto className="mb-6 h-12 w-12 opacity-60" />
      <h2 className="text-xl font-bold text-ink">Algo salió mal</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Ocurrió un error inesperado. Puede ser un problema de red temporal.
      </p>
      <button
        type="button"
        onClick={reset}
        className="btn-primary mt-6"
      >
        <RefreshCcw className="h-4 w-4" />
        Intentar de nuevo
      </button>
    </div>
  );
}
