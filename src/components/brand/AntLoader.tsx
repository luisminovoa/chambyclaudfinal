"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AntIcon } from "@/components/brand/AntIcon";
import { cn } from "@/lib/utils";

/**
 * Loader exclusivo de Chamby: la hormiguita camina sobre una línea punteada
 * mientras carga el contenido. Sustituye a cualquier spinner genérico.
 */
export function AntLoader({ label = "Cargando...", className }: { label?: string; className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div role="status" aria-label={label} className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative h-12 w-40 overflow-hidden">
        <motion.div
          className="absolute bottom-1 text-primary-600"
          initial={false}
          animate={
            reduce
              ? undefined
              : { x: [-36, 160], y: [0, -2, 0, -2, 0, -2, 0, -2, 0], rotate: [0, -3, 0, -3, 0, -3, 0, -3, 0] }
          }
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <AntIcon className="h-9 w-9" />
        </motion.div>
        <div className="absolute inset-x-0 bottom-0 border-b-2 border-dashed border-primary-200" aria-hidden />
      </div>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}
