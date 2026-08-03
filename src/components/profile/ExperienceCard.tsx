"use client";

import { useState, useTransition } from "react";
import { Briefcase, Pencil, Trash2, Calendar } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { updateWorkerExperience, deleteWorkerExperience } from "@/lib/actions/profile";
import { ExperienceForm } from "@/components/profile/ExperienceForm";
import type { WorkerExperience } from "@/lib/types";

function formatMonthYear(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("es-PE", { month: "short", year: "numeric" });
}

interface ExperienceCardProps {
  experience: WorkerExperience;
  onUpdated: (experience: WorkerExperience) => void;
  onDeleted: (id: string) => void;
  onStatsChange: () => void;
}

export function ExperienceCard({
  experience,
  onUpdated,
  onDeleted,
  onStatsChange,
}: ExperienceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await updateWorkerExperience(experience.id, formData);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        onUpdated(result.experience!);
        onStatsChange();
        setIsEditing(false);
        toast("Experiencia actualizada", "success");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWorkerExperience(experience.id);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        onDeleted(experience.id);
        onStatsChange();
        toast("Experiencia eliminada", "success");
      }
    });
  }

  if (isEditing) {
    return (
      <div className="card p-5">
        <ExperienceForm
          initial={experience}
          isPending={isPending}
          onSubmit={handleSave}
          onCancel={() => setIsEditing(false)}
          submitLabel="Guardar cambios"
        />
      </div>
    );
  }

  return (
    <div className="card flex items-start gap-3 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50">
        <Briefcase className="h-5 w-5 text-primary-500" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">{experience.job_title}</p>
        <p className="text-sm text-ink-muted">{experience.company}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatMonthYear(experience.start_date)} —{" "}
          {experience.is_current ? "Actualidad" : experience.end_date ? formatMonthYear(experience.end_date) : ""}
        </p>
        {experience.description && (
          <p className="mt-2 text-sm text-ink-muted">{experience.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={isPending}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-ink"
          aria-label="Editar experiencia"
        >
          <Pencil className="h-4 w-4" />
        </button>

        {confirmDelete ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-xl bg-danger-500 px-2.5 py-1 text-xs font-semibold text-white"
            >
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink-muted"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-danger-50 hover:text-danger-500"
            aria-label="Eliminar experiencia"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
