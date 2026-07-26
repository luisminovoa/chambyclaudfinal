"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción) para el modo offline básico. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin SW la app sigue funcionando igual; no interrumpir al usuario.
    });
  }, []);

  return null;
}
