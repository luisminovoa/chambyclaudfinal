"use client";

import { useEffect } from "react";

/**
 * ⚠️ DIAGNÓSTICO TEMPORAL — quitar tras identificar la causa raíz del
 * "Algo salió mal" reportado al abrir ciertos perfiles.
 *
 * Red de seguridad para errores que el try/catch de page.tsx no puede
 * atrapar: los que ocurren dentro de un componente referenciado vía JSX
 * más profundo que las 6 secciones (Avatar, Badge, StatCard,
 * VerificationBadges, RatingStars, EmptyState) — React no ejecuta esos
 * componentes hasta la reconciliación, fuera de cualquier try/catch de
 * un Server Component. Next.js sí los captura acá porque este archivo es
 * el error boundary oficial de la ruta /admin/users/[id].
 *
 * Muestra el digest en pantalla (para no tener que buscarlo a mano en
 * DevTools) y lo loguea en la consola del navegador. El mensaje/stack
 * completos NO llegan hasta acá en producción — Next.js los redacta
 * antes de mandarlos al cliente; el error original completo solo queda
 * en los logs del servidor (ver console.error de page.tsx o, si el
 * fallo ocurrió más profundo, el log automático de Next.js para
 * cualquier error de render de Server Component).
 */
export default function AdminUserProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DIAG /admin/users/[id]] error boundary (cliente)", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h2 className="text-xl font-bold text-ink">[DIAG] No se pudo cargar este perfil</h2>
      <p className="mt-2 text-sm text-ink-muted">
        {error.message || "Mensaje no disponible (redactado en producción)."}
      </p>
      {error.digest && (
        <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-ink">
          digest: {error.digest}
        </p>
      )}
      <button type="button" onClick={reset} className="btn-primary mt-6">
        Reintentar
      </button>
    </div>
  );
}
