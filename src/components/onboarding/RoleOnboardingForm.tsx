"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Search, Briefcase, Users } from "lucide-react";
import { completeGoogleOnboarding } from "@/lib/actions/roles";
import { cn } from "@/lib/utils";
import { LocationSelector, type LocationValue } from "@/components/ui/LocationSelector";

const initialState: { error?: string } = {};

/**
 * Fase C4-G9.2.2: deriva `city` (NOT NULL en profiles, columna leída por el
 * resto de la app) del nivel más específico ya elegido — mismo criterio ya
 * usado en InfoTab.tsx/NewJobForm.tsx (`city = district`) y
 * EmployerInfoTab.tsx (`city = province`). Si solo hay departamento (sin
 * provincia todavía), se deja vacía en vez de inventar un valor — mismo
 * comportamiento que ya tenía el <select> de ciudad cuando no se elegía
 * nada: completeGoogleOnboarding() trata `city` vacía como "no actualizar
 * esta columna", nunca como un valor real. Exportada para poder probar la
 * derivación sin necesitar simular una selección real en el DOM (este
 * proyecto no usa jsdom).
 */
export function deriveOnboardingCity(location: LocationValue): string {
  return location.district || location.province || "";
}

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
  /**
   * profile.city ya existente (caso raro: usuario que vuelve a
   * /onboarding). Fase C4-F. Desde C4-G9.2.2 ya no se usa para preseleccionar
   * nada: un único string histórico de ciudad no mapea de forma confiable a
   * department/province (ese mapeo no existe fuera de los dos casos ya
   * cubiertos por cities.ts, que esta fase no debía tocar), así que
   * LocationSelector siempre arranca vacío. Se conserva el prop — sin
   * eliminarlo — únicamente porque OnboardingPage (src/app/onboarding/page.tsx,
   * fuera del alcance autorizado de esta fase) todavía lo pasa.
   */
  initialCity?: string | null;
}

export function RoleOnboardingForm({ next }: RoleOnboardingFormProps) {
  const [state, formAction] = useFormState(completeGoogleOnboarding, initialState);
  const [intent, setIntent] = useState<"worker" | "employer" | "both" | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    department: "",
    province: "",
    district: "",
  });
  const city = deriveOnboardingCity(location);

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
        <p className="label">
          Ubicación <span className="font-normal text-ink-muted">(opcional)</span>
        </p>
        {/* Fase C4-G9.2.2: reemplaza el <select> de CITY_NAMES (Chiclayo/
            Trujillo) por el mismo LocationSelector jerárquico ya usado en
            InfoTab.tsx/EmployerInfoTab.tsx/NewJobForm.tsx — sin crear un
            segundo catálogo ni componente. Guardado progresivo: el usuario
            puede continuar sin elegir nada, o deteniéndose en cualquier
            nivel — completeGoogleOnboarding() (C4-G9.2.1) es quien valida
            la jerarquía contra src/lib/ubigeo.ts; este componente no
            duplica esa validación. */}
        <LocationSelector
          idPrefix="onboarding-location"
          department={location.department}
          province={location.province}
          district={location.district}
          onChange={setLocation}
        />
        {/* `city` (NOT NULL en profiles, leída por el resto de la app) ya
            no se elige directamente — se deriva del nivel más específico
            elegido (deriveOnboardingCity), igual que en el resto de
            formularios de ubicación jerárquica. Sigue viajando como campo
            nombrado `city` del mismo <form>, tal como ya lo lee
            completeGoogleOnboarding(). */}
        <input type="hidden" name="city" value={city} />
      </div>

      <SubmitButton disabled={!intent} />
    </form>
  );
}
