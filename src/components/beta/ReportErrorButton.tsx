"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bug, X, Send, CheckCircle } from "lucide-react";
import { submitBugReport } from "@/lib/actions/beta";
import { BETA_CONFIG } from "@/lib/beta-config";

interface ReportErrorButtonProps {
  userId: string | null;
}

function getBrowserInfo() {
  if (typeof navigator === "undefined" || typeof screen === "undefined") {
    return { browser: null, os: null, resolution: null };
  }
  const ua = navigator.userAgent;
  const resolution = `${screen.width}×${screen.height}`;

  let browser = ua;
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";

  let os = "Desconocido";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return { browser, os, resolution };
}

export function ReportErrorButton({ userId }: ReportErrorButtonProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      setSent(false);
      setError(null);
      setDescription("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  void userId; // captured in server action via auth

  function handleSubmit() {
    if (!description.trim()) return;
    const { browser, os, resolution } = getBrowserInfo();

    startTransition(async () => {
      const result = await submitBugReport({
        route: pathname,
        description,
        browser,
        os,
        resolution,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
        setTimeout(() => setOpen(false), 2000);
      }
    });
  }

  const { browser, os, resolution } = getBrowserInfo();

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Reportar un error"
        className="fixed bottom-24 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-ink-muted transition-all hover:border-danger-300 hover:text-danger-600 hover:shadow-glow sm:bottom-6"
      >
        <Bug className="h-4 w-4" />
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-label="Reportar un error"
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-danger-600" />
                <h2 className="text-sm font-bold text-ink">Reportar un error</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle className="mb-3 h-10 w-10 text-success-500" />
                <p className="font-semibold text-ink">¡Gracias por el reporte!</p>
                <p className="mt-1 text-sm text-ink-muted">Lo revisaremos pronto.</p>
              </div>
            ) : (
              <>
                {/* Captured metadata */}
                <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-ink-muted space-y-0.5">
                  <p><span className="font-medium">Ruta:</span> {pathname}</p>
                  <p><span className="font-medium">Versión:</span> {BETA_CONFIG.version}</p>
                  <p><span className="font-medium">Navegador:</span> {browser}</p>
                  <p><span className="font-medium">OS:</span> {os}</p>
                  <p><span className="font-medium">Resolución:</span> {resolution}</p>
                  <p><span className="font-medium">Hora:</span> {new Date().toLocaleTimeString("es-PE")}</p>
                </div>

                {/* Description */}
                <label className="mb-1 block text-xs font-semibold text-ink">
                  ¿Qué pasó? <span className="text-danger-500">*</span>
                </label>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe el error con el mayor detalle posible: qué estabas haciendo, qué esperabas que pasara y qué pasó realmente."
                  className="input w-full resize-none text-sm"
                />
                <p className="mt-1 text-right text-[10px] text-ink-muted">{description.length}/2000</p>

                {error && (
                  <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!description.trim() || isPending}
                  className="btn-primary mt-4 w-full"
                >
                  {isPending ? (
                    "Enviando…"
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Enviar reporte
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
