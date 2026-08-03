"use client";

import { useId, useMemo, useRef, useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SKILLS_CATALOG } from "@/lib/skills-catalog";

interface SkillsSelectorProps {
  value: string[];
  onChange: (skills: string[]) => void;
  max?: number;
}

export function SkillsSelector({ value: skills, onChange, max = 15 }: SkillsSelectorProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `skills-suggestions-${useId()}`;

  const atLimit = skills.length >= max;

  const suggestions = useMemo(() => {
    const query = input.trim().toLowerCase();
    const selected = new Set(skills.map((s) => s.toLowerCase()));
    const pool = SKILLS_CATALOG.filter((s) => !selected.has(s.toLowerCase()));
    const filtered = query
      ? pool.filter((s) => s.toLowerCase().includes(query))
      : pool;
    return filtered.slice(0, 8);
  }, [input, skills]);

  function addSkill(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || atLimit) return;
    // Si coincide (sin distinguir mayúsculas) con una entrada del catálogo,
    // usa esa forma canónica en vez de lo que el usuario escribió.
    const canonical =
      SKILLS_CATALOG.find((s) => s.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
    if (skills.some((s) => s.toLowerCase() === canonical.toLowerCase())) return;
    onChange([...skills, canonical]);
    setInput("");
  }

  function removeSkill(skill: string) {
    onChange(skills.filter((s) => s !== skill));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(input);
    } else if (e.key === "Backspace" && input === "" && skills.length > 0) {
      onChange(skills.slice(0, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <div>
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

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className={cn("input w-full", atLimit && "opacity-50")}
          placeholder={atLimit ? "Límite alcanzado" : "Ej: Soldadura, Excel, Manejo…"}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Se retrasa el cierre para que el mousedown de una sugerencia
            // (que hace preventDefault) alcance a registrarse primero.
            setTimeout(() => setShowSuggestions(false), 100);
          }}
          onKeyDown={handleKeyDown}
          disabled={atLimit}
        />

        {showSuggestions && !atLimit && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-card"
          >
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    // preventDefault evita que el input pierda foco antes
                    // de que este click se registre.
                    e.preventDefault();
                    addSkill(s);
                    inputRef.current?.focus();
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {skills.length}/{max} habilidades · 3 habilidades completan tu sección de experiencia
      </p>
    </div>
  );
}
