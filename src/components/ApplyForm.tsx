"use client";

import { useState, useTransition } from "react";
import { applyToJob } from "@/lib/actions/jobs";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await applyToJob(jobId, message);
      setResult(res);
    });
  }

  if (result?.success) {
    return (
      <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
        ¡Postulación enviada! El empleador revisará tu solicitud.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {result?.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</div>
      )}
      <div>
        <label className="label">Mensaje para el empleador (opcional)</label>
        <textarea
          className="input min-h-[90px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Cuéntale al empleador por qué eres ideal para este trabajo..."
        />
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? "Enviando..." : "Postular a este trabajo"}
      </button>
    </form>
  );
}
