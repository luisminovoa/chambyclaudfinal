"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success-500" />,
  error: <XCircle className="h-5 w-5 text-danger-500" />,
  info: <Info className="h-5 w-5 text-primary-500" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), 3500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-slate-100 bg-white/95 px-4 py-3 shadow-lifted backdrop-blur"
              )}
            >
              {icons[t.tone]}
              <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar notificación"
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
