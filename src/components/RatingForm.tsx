"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RatingStars } from "@/components/RatingStars";
import { submitRating } from "@/lib/actions/ratings";

export function RatingForm({
  jobId,
  ratedId,
  ratedName,
}: {
  jobId: string;
  ratedId: string;
  ratedName: string;
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitRating({ jobId, ratedId, score, comment });
      setResult(res);
      if (res.success) router.refresh();
    });
  }

  if (result?.success) {
    return (
      <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
        ¡Gracias por calificar a {ratedName}!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-700">Califica a {ratedName}</p>
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      <RatingStars value={score} onChange={setScore} size="lg" />
      <textarea
        className="input min-h-[70px]"
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="submit" disabled={isPending} className="btn-accent w-full">
        {isPending ? "Enviando..." : "Enviar calificación"}
      </button>
    </form>
  );
}
