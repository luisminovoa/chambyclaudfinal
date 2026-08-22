"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Search, Briefcase, Users } from "lucide-react";
import { completeGoogleOnboarding } from "@/lib/actions/roles";
import { cn } from "@/lib/utils";
import { CITY_NAMES, normalizeCity } from "@/lib/cities";

const initialState: { error?: string } = {};

const OPTIONS = [
  { value: "worker", label: "Buscar trabajo", icon: Search },
  { value: "employer", label: "Contratar personas", icon: Briefcase },
  { value: "both", label: "Ambos", icon: Users },
] as const;

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full">
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        <>
          Continuar
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

interface RoleOnboardingFormProps {
  next?: string;
  /** profile.city ya existente (caso raro: usuario que vuelve a /onboarding). Fase C4-F. */
  initialCity?: string | null;
}

export function RoleOnboardingForm({ next, initialCity }: RoleOnboardingFormProps) {
  const [state, formAction] = useFormState(completeGoogleOnboarding, initialState);
  const [intent, setIntent] = useState<"worker" | "employer" | "both" | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="grid gap-3" role="radiogroup" aria-label="¿Qué quieres hacer en Chamby?">
        {OPTIONS.map((opt) => (
          <motion.button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={intent === opt.value}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIntent(opt.value)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-sm font-semibold transition-all duration-200",
              intent === opt.value
                ? "border-primary-600 bg-primary-50 text-primary-700 shadow-glow-sm"
                : "border-slate-200 text-ink-muted hover:border-slate-300"
            )}
          >
            <opt.icon className="h-5 w-5 shrink-0" />
            {opt.label}
          </motion.button>
        ))}
        <input type="hidden" name="intent" value={intent ?? ""} />
      </div>

      <div>
        <label htmlFor="city" className="label">
          Ciudad <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <select id="city" name="city" className="input" defaultValue={normalizeCity(initialCity) ?? ""}>
          <option value="">Selecciona tu ciudad</option>
          {CITY_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton disabled={!intent} />
    </form>
  );
}
