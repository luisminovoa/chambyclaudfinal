"use client";

import { motion } from "framer-motion";

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-primary-100"
    >
      <motion.div
        className="h-full rounded-full bg-brand-gradient"
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
