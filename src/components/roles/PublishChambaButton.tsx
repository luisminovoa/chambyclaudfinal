"use client";

import { Plus } from "lucide-react";
import { useActivateRole } from "@/components/roles/use-activate-role";

interface PublishChambaButtonProps {
  hasEmployerRole: boolean;
}

/**
 * "+ Publicar Chamba" del Navbar. CASO 1 (sin rol employer): lo agrega,
 * conserva worker, activa employer. CASO 2 (ya lo tiene): solo activa
 * employer. En ambos casos termina en /jobs/new. Texto completo desde
 * `md:` (desktop); en tablet/mobile de escritorio (`sm`-`md`) queda solo
 * el ícono — mismo patrón `hidden md:inline` que ya usa el botón de
 * salir del Navbar. En mobile real, el tab central del BottomNav cubre
 * el mismo flujo con el ícono "+" (no hay menú hamburguesa en esta app).
 */
export function PublishChambaButton({ hasEmployerRole }: PublishChambaButtonProps) {
  const { activate, isPending } = useActivateRole("employer", hasEmployerRole, "/jobs/new");

  return (
    <button
      type="button"
      onClick={activate}
      disabled={isPending}
      className="btn-primary !min-h-0 gap-1.5 !px-3 !py-2 text-sm disabled:opacity-60"
      aria-label="Publicar Chamba"
    >
      <Plus className="h-4 w-4" />
      <span className="hidden md:inline">Publicar Chamba</span>
    </button>
  );
}
