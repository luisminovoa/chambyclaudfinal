"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AntIllustration } from "@/components/brand/AntIllustration";

/**
 * Hormiguita protagonista del hero: saluda y flota suavemente
 * sobre un camino punteado que sugiere movimiento.
 */
export function HeroAnt() {
  const reduce = useReducedMotion();

  return (
    <div className="relative" aria-hidden>
      {/* camino punteado */}
      <svg viewBox="0 0 260 140" fill="none" className="absolute -left-24 top-16 hidden w-64 text-primary-200 lg:block">
        <path
          d="M4 120C60 130 90 90 130 70S220 40 256 14"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 10"
        />
      </svg>
      <motion.div
        initial={false}
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <AntIllustration pose="wave" className="w-44 text-primary-600 sm:w-56 lg:w-72" />
      </motion.div>
    </div>
  );
}
