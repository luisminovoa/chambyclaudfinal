"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { saveJob, unsaveJob } from "@/lib/actions/worker-jobs";
import { useToast } from "@/components/ui/Toaster";

export function SaveJobButton({
  jobId,
  initialSaved,
}: {
  jobId: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = saved ? await unsaveJob(jobId) : await saveJob(jobId);
      if (result.error) {
        toast(result.error, "error");
      } else {
        setSaved((v) => !v);
        toast(saved ? "Eliminado de guardados" : "Trabajo guardado");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-label={saved ? "Quitar de guardados" : "Guardar trabajo"}
      className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600 disabled:opacity-50"
    >
      {saved ? (
        <BookmarkCheck className="h-5 w-5 text-primary-600" />
      ) : (
        <Bookmark className="h-5 w-5" />
      )}
    </button>
  );
}
