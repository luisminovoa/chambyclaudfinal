"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteJob, adminUpdateJobStatus } from "@/lib/actions/admin";
import { jobStatusColor, jobStatusLabel, formatDate } from "@/lib/utils";
import type { Job } from "@/lib/types";

export function AdminJobRow({ job }: { job: Job }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    startTransition(async () => {
      await adminUpdateJobStatus(job.id, e.target.value);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("¿Eliminar esta publicación de forma permanente?")) return;
    startTransition(async () => {
      await adminDeleteJob(job.id);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pr-4">
        <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-slate-900 hover:underline">
          {job.title}
        </Link>
        <p className="text-xs text-slate-500">{job.category} · {job.city}</p>
      </td>
      <td className="py-3 pr-4">
        <select
          disabled={isPending}
          defaultValue={job.status}
          onChange={handleStatusChange}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
        >
          <option value="abierto">Abierto</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-500">{formatDate(job.created_at)}</td>
      <td className="py-3 text-right">
        <button disabled={isPending} onClick={handleDelete} className="btn-ghost !px-3 !py-1 text-xs text-red-600">
          Eliminar
        </button>
      </td>
    </tr>
  );
}
