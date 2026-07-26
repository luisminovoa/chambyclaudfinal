"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Send, AlertCircle } from "lucide-react";
import { applyToJob } from "@/lib/actions/jobs";
import { useToast } from "@/components/ui/Toaster";
import { AntIllustration } from "@/components/brand/AntIllustration";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await applyToJob(jobId, message);
      setResult(res);
      if (res.success) toast("¡Postulación enviada!");
      if (res.error) toast(res.error, "error");
    });
  }

  if (result?.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2 rounded-2xl bg-success-50 px-4 py-6 text-center"
      >
        <AntIllustration pose="celebrate" className="w-28 text-success-600" />
        <p className="flex items-center gap-2 text-sm font-semibold text-success-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          ¡Postulación enviada! El empleador revisará tu solicitud.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {result?.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {result.error}
        </div>
      )}
      <div>
        <label htmlFor="apply-message" className="label">
          Mensaje para el empleador (opcional)
        </label>
        <textarea
          id="apply-message"
          className="input min-h-[100px] resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Cuéntale al empleador por qué eres ideal para este trabajo..."
        />
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Postular a este trabajo
          </>
        )}
      </button>
    </form>
  );
}
