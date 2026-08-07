"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bookmark, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";

const STORAGE_KEY = "chamby:saved-jobs";

function readSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface JobCardActionsProps {
  jobId: string;
  jobTitle: string;
  isOwner?: boolean;
  /** Ya calculado por el caller vía canShowApplyButton() (src/lib/job-apply-access.ts). */
  showApply?: boolean;
  /**
   * Si se pasa, "Postular" hace scroll suave a este id en vez de navegar —
   * evita el bug reportado en /jobs/[id]: ahí el botón navegaba a la misma
   * URL en la que ya se está parado, así que visualmente no pasaba nada.
   * Sin este prop (uso en tarjetas de listado), sigue navegando al detalle.
   */
  scrollTargetId?: string;
}

export function JobCardActions({
  jobId,
  jobTitle,
  isOwner = false,
  showApply = !isOwner,
  scrollTargetId,
}: JobCardActionsProps) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    setSaved(readSaved().includes(jobId));
  }, [jobId]);

  function toggleSave() {
    const current = readSaved();
    const next = current.includes(jobId)
      ? current.filter((id) => id !== jobId)
      : [...current, jobId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const nowSaved = next.includes(jobId);
    setSaved(nowSaved);
    toast(nowSaved ? "Empleo guardado" : "Empleo eliminado de guardados", "info");
  }

  async function share() {
    const url = `${window.location.origin}/jobs/${jobId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: jobTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Enlace copiado al portapapeles");
      }
    } catch {
      // El usuario canceló el diálogo de compartir
    }
  }

  function handleApplyClick() {
    if (scrollTargetId) {
      document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      router.push(`/jobs/${jobId}`);
    }
  }

  return (
    <div className="relative z-10 flex items-center gap-1.5">
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={toggleSave}
        aria-label={saved ? "Quitar de guardados" : "Guardar empleo"}
        aria-pressed={saved}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200",
          saved
            ? "bg-primary-50 text-primary-600"
            : "text-slate-500 hover:bg-slate-100 hover:text-ink"
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={share}
        aria-label="Compartir empleo"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-ink"
      >
        <Share2 className="h-4 w-4" />
      </motion.button>
      {showApply && (
        <button onClick={handleApplyClick} className="btn-primary !px-4 !py-2 text-xs">
          Postular
        </button>
      )}
    </div>
  );
}
