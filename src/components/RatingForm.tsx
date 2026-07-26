"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Star } from "lucide-react";
import { RatingStars } from "@/components/RatingStars";
import { submitRating } from "@/lib/actions/ratings";
import { useToast } from "@/components/ui/Toaster";

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
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitRating({ jobId, ratedId, score, comment });
      setResult(res);
      if (res.success) {
        toast("¡Calificación enviada!");
        router.refresh();
      }
    });
  }

  if (result?.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card flex items-center gap-3 p-5 text-sm font-medium text-success-700"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
        ¡Gracias por calificar a {ratedName}!
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      <p className="flex items-center gap-2 text-base font-bold text-ink">
        <Star className="h-5 w-5 text-warning-500" />
        Califica a {ratedName}
      </p>
      {result?.error && (
        <p role="alert" className="rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
          {result.error}
        </p>
      )}
      <RatingStars value={score} onChange={setScore} size="lg" />
      <textarea
        className="input min-h-[80px] resize-y"
        placeholder="Comentario (opcional)"
        aria-label="Comentario de la calificación"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? "Enviando..." : "Enviar calificación"}
      </button>
    </form>
  );
}
