"use client";

import { motion, AnimatePresence } from "framer-motion";

export function TypingIndicator({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-2 px-2 py-1"
          aria-live="polite"
          aria-label="La otra persona está escribiendo"
        >
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">
            {[0, 0.15, 0.3].map((delay, i) => (
              <motion.span
                key={i}
                className="block h-2 w-2 rounded-full bg-slate-400"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
