"use client";

import { useState, useTransition, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { updateProfile, computeAndSaveProfileStats } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

const CATEGORIES = [
  "Electricista",
  "Albañil",
  "Plomero",
  "Carpintero",
  "Pintor",
  "Niñera / Cuidador",
  "Limpieza",
  "Jardinero",
  "Conductor",
  "Seguridad",
  "Cocinero",
  "Mesero",
  "Administrativo",
  "Técnico en computadoras",
  "Diseñador",
  "Otro",
];

interface InfoTabProps {
  profile: Profile;
  onStatsChange: () => void;
}

export function InfoTab({ profile, onStatsChange }: InfoTabProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [bio, setBio] = useState(profile.bio ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [category, setCategory] = useState(profile.category ?? "");
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);
  const [skillInput, setSkillInput] = useState("");

  function addSkill(value: string) {
    const trimmed = value.trim();
    if (!trimmed || skills.includes(trimmed) || skills.length >= 15) return;
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  }

  function handleSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    } else if (e.key === "Backspace" && skillInput === "" && skills.length > 0) {
      setSkills((prev) => prev.slice(0, -1));
    }
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("bio", bio);
    fd.set("phone", phone);
    fd.set("city", city);
    fd.set("category", category);
    fd.set("skills", skills.join(","));

    startTransition(async () => {
      const result = await updateProfile(fd);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        await computeAndSaveProfileStats();
        onStatsChange();
        toast("Perfil actualizado correctamente", "success");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 sm:p-6">
        <h3 className="mb-5 text-sm font-bold text-ink">Datos personales</h3>
        <div className="space-y-4">
          {/* Phone */}
          <div>
            <label htmlFor="phone" className="label">
              Teléfono
            </label>
            <input
              id="phone"
              type="tel"
              className="input w-full"
              placeholder="+51 999 999 999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="city" className="label">
              Ciudad
            </label>
            <input
              id="city"
              type="text"
              className="input w-full"
              placeholder="Lima, Arequipa, Trujillo…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="label">
              Especialidad principal
            </label>
            <select
              id="category"
              className="input w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Selecciona una especialidad</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-5 text-sm font-bold text-ink">Descripción profesional</h3>
        <div>
          <label htmlFor="bio" className="label">
            Sobre ti
          </label>
          <textarea
            id="bio"
            rows={4}
            className="input w-full resize-none"
            placeholder="Describe tu experiencia, lo que haces mejor y por qué contrataría trabajar contigo…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
          />
          <p className="mt-1 text-right text-xs text-ink-muted">{bio.length}/500</p>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-bold text-ink">Habilidades</h3>
        <p className="mb-4 text-xs text-ink-muted">
          Escribe una habilidad y presiona Enter para añadirla. Máximo 15.
        </p>

        {/* Tags display */}
        {skills.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="rounded-full hover:text-danger-500"
                  aria-label={`Eliminar ${skill}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          type="text"
          className={cn("input w-full", skills.length >= 15 && "opacity-50")}
          placeholder={
            skills.length >= 15 ? "Límite alcanzado" : "Ej: Soldadura, Excel, Manejo…"
          }
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={handleSkillKeyDown}
          onBlur={() => skillInput && addSkill(skillInput)}
          disabled={skills.length >= 15}
        />
        <p className="mt-1 text-xs text-ink-muted">
          {skills.length}/15 habilidades · 3 habilidades completan tu sección de experiencia
        </p>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
