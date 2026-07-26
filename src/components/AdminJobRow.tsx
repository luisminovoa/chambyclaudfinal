"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { adminDeleteJob, adminUpdateJobStatus } from "@/lib/actions/admin";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import type { Job } from "@/lib/types";

export function AdminJobRow({ job }: { job: Job }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    startTransition(async () => {
      await adminUpdateJobStatus(job.id, e.target.value);
      toast("Estado actualizado", "info");
      router.refresh();
    });
  }

  function handleDelete() {
    setConfirming(false);
    startTransition(async () => {
      await adminDeleteJob(job.id);
      toast("Publicación eliminada", "info");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3.5 pr-4">
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm font-bold text-ink transition-colors duration-200 hover:text-primary-600"
        >
          {job.title}
        </Link>
        <p className="text-xs text-ink-muted">
          {job.category} · {job.city}
        </p>
      </td>
      <td className="py-3.5 pr-4">
        <select
          disabled={isPending}
          defaultValue={job.status}
          onChange={handleStatusChange}
          aria-label={`Estado de ${job.title}`}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium shadow-soft transition-colors hover:border-slate-300 focus:border-primary-500"
        >
          <option value="abierto">Abierto</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </td>
      <td className="py-3.5 pr-4 text-xs text-ink-muted">{formatDate(job.created_at)}</td>
      <td className="py-3.5 text-right">
        {confirming ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-slate-100"
            >
              No
            </button>
            <button
              disabled={isPending}
              onClick={handleDelete}
              className="rounded-xl bg-danger-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-600"
            >
              Sí, eliminar
            </button>
          </span>
        ) : (
          <button
            disabled={isPending}
            onClick={() => setConfirming(true)}
            aria-label={`Eliminar ${job.title}`}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-danger-600 transition-colors duration-200 hover:bg-danger-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        )}
      </td>
    </tr>
  );
}
