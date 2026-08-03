"use client";

import { useState } from "react";
import type { WorkerExperience } from "@/lib/types";

interface ExperienceFormProps {
  initial?: Pick<
    WorkerExperience,
    "company" | "job_title" | "start_date" | "end_date" | "is_current" | "description"
  >;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}

export function ExperienceForm({
  initial,
  isPending,
  submitLabel,
  onSubmit,
  onCancel,
}: ExperienceFormProps) {
  const [company, setCompany] = useState(initial?.company ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [isCurrent, setIsCurrent] = useState(initial?.is_current ?? false);
  const [description, setDescription] = useState(initial?.description ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("company", company);
    fd.set("job_title", jobTitle);
    fd.set("start_date", startDate);
    fd.set("end_date", isCurrent ? "" : endDate);
    fd.set("is_current", String(isCurrent));
    fd.set("description", description);
    onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className="label">
            Empresa
          </label>
          <input
            id="company"
            type="text"
            required
            className="input w-full"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="job_title" className="label">
            Cargo
          </label>
          <input
            id="job_title"
            type="text"
            required
            className="input w-full"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className="label">
            Fecha inicio
          </label>
          <input
            id="start_date"
            type="date"
            required
            className="input w-full"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="end_date" className="label">
            Fecha fin
          </label>
          <input
            id="end_date"
            type="date"
            className="input w-full disabled:opacity-50"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isCurrent}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={isCurrent}
          onChange={(e) => setIsCurrent(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        Trabajo actual
      </label>

      <div>
        <label htmlFor="description" className="label">
          Descripción
        </label>
        <textarea
          id="description"
          rows={3}
          className="input w-full resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
        <p className="mt-1 text-right text-xs text-ink-muted">{description.length}/500</p>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
