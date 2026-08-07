"use client";

import { ArrowLeftRight } from "lucide-react";
import { useActivateRole } from "@/components/roles/use-activate-role";

/**
 * Corrección de auditoría (bloqueante): en mobile, UserMenu (que tiene
 * "Panel Trabajador") es `hidden sm:block` y el tab central del
 * BottomNav solo activa employer — sin este botón, un usuario mobile
 * que entra a modo employer no tenía NINGÚN control para volver a
 * modo worker. Se renderiza directo en el body de la página (no es
 * chrome de nav), así que es visible en todos los viewports sin
 * necesidad de un nuevo componente de navegación.
 */
export function BackToWorkerButton() {
  const { activate, isPending } = useActivateRole("worker", true, "/dashboard/worker");

  return (
    <button
      type="button"
      onClick={activate}
      disabled={isPending}
      className="btn-secondary gap-1.5 !px-3 !py-2 text-sm disabled:opacity-60"
    >
      <ArrowLeftRight className="h-4 w-4" />
      Volver a modo Trabajador
    </button>
  );
}
