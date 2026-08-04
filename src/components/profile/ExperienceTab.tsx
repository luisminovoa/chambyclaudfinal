"use client";

import { useState, useTransition } from "react";
import { Plus, Briefcase } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { addWorkerExperience } from "@/lib/actions/profile";
import { refreshProfileStats } from "@/lib/profile-stats";
import { ExperienceForm } from "@/components/profile/ExperienceForm";
import { ExperienceCard } from "@/components/profile/ExperienceCard";
import type { WorkerExperience, ProfileStats } from "@/lib/types";

interface ExperienceTabProps {
  initialExperience: WorkerExperience[];
  onStatsChange: (stats: ProfileStats) => void;
}

export function ExperienceTab({ initialExperience, onStatsChange }: ExperienceTabProps) {
  const [experience, setExperience] = useState<WorkerExperience[]>(initialExperience);
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await addWorkerExperience(formData);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        setExperience((prev) =>
          [result.experience!, ...prev].sort((a, b) => {
            if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
            return b.start_date.localeCompare(a.start_date);
          })
        );
        setIsAdding(false);
        await refreshProfileStats(onStatsChange);
        toast("Experiencia añadida", "success");
      }
    });
  }

  function handleUpdated(updated: WorkerExperience) {
    setExperience((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleDeleted(id: string) {
    setExperience((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      {isAdding ? (
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Nueva experiencia</h3>
          <ExperienceForm
            isPending={isPending}
            submitLabel="Agregar experiencia"
            onSubmit={handleAdd}
            onCancel={() => setIsAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="btn-secondary w-full justify-center"
        >
          <Plus className="h-4 w-4" />
          Agregar experiencia
        </button>
      )}

      {experience.length === 0 && !isAdding ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
            <Briefcase className="h-7 w-7 text-primary-400" />
          </div>
          <div>
            <p className="font-bold text-ink">Sin experiencia registrada</p>
            <p className="mt-1 text-sm text-ink-muted">
              Agrega tus trabajos anteriores para fortalecer tu perfil
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {experience.map((exp) => (
            <ExperienceCard
              key={exp.id}
              experience={exp}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onStatsChange={onStatsChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
