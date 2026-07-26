"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";
import {
  FileText,
  Wallet,
  ClipboardList,
  Eye,
  ArrowLeft,
  ArrowRight,
  MapPin,
  AlertCircle,
  Check,
  ChevronDown,
} from "lucide-react";
import { createJob } from "@/lib/actions/jobs";
import type { ActionResult } from "@/lib/actions/auth";
import { CATEGORY_NAMES } from "@/lib/categories";
import { Progress } from "@/components/ui/Progress";
import { formatCurrency, payTypeLabel, cn } from "@/lib/utils";

const initialState: ActionResult = {};

const STEPS = [
  { title: "Información", icon: FileText },
  { title: "Pago", icon: Wallet },
  { title: "Requisitos", icon: ClipboardList },
  { title: "Vista previa", icon: Eye },
];

// Validación local por paso; el server action vuelve a validar todo al enviar.
const stepSchemas = [
  z.object({
    title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
    description: z.string().min(20, "La descripción debe tener al menos 20 caracteres"),
    category: z.string().min(2, "Indica un puesto o categoría"),
    city: z.string().min(2, "Indica una ciudad"),
  }),
  z.object({
    pay_amount: z
      .string()
      .refine((v) => v === "" || Number(v) > 0, "El pago debe ser mayor a 0"),
    pay_type: z.enum(["por_hora", "por_dia", "fijo"]),
  }),
  z.object({
    positions_needed: z.coerce.number().int().min(1, "Debe haber al menos 1 vacante"),
  }),
];

interface FormValues {
  title: string;
  description: string;
  category: string;
  city: string;
  address: string;
  pay_amount: string;
  pay_type: "por_hora" | "por_dia" | "fijo";
  positions_needed: string;
}

const emptyValues: FormValues = {
  title: "",
  description: "",
  category: "",
  city: "",
  address: "",
  pay_amount: "",
  pay_type: "fijo",
  positions_needed: "1",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary flex-1">
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Publicando...
        </>
      ) : (
        <>
          <Check className="h-4 w-4" />
          Publicar trabajo
        </>
      )}
    </button>
  );
}

export function NewJobForm() {
  const [state, formAction] = useFormState(createJob, initialState);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [stepError, setStepError] = useState<string | null>(null);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function next() {
    const schema = stepSchemas[step];
    if (schema) {
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        setStepError(parsed.error.errors[0]?.message ?? "Revisa los campos");
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  const CurrentIcon = STEPS[step].icon;

  return (
    <div>
      {/* Indicador de pasos */}
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <CurrentIcon className="h-4 w-4" />
          </span>
          Paso {step + 1} de {STEPS.length}: {STEPS[step].title}
        </p>
        <span className="text-xs font-semibold text-ink-muted">
          {Math.round(((step + 1) / STEPS.length) * 100)}%
        </span>
      </div>
      <Progress value={((step + 1) / STEPS.length) * 100} label="Progreso del formulario" />

      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="label">
                    Título del trabajo
                  </label>
                  <input
                    id="title"
                    className="input"
                    value={values.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Ej. Electricista para obra en San Isidro"
                  />
                </div>
                <div>
                  <label htmlFor="description" className="label">
                    Descripción
                  </label>
                  <textarea
                    id="description"
                    className="input min-h-[130px] resize-y"
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Describe las tareas, requisitos y horario..."
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="category" className="label">
                      Puesto / categoría
                    </label>
                    <div className="relative">
                      <select
                        id="category"
                        className="input cursor-pointer appearance-none pr-10"
                        value={values.category}
                        onChange={(e) => set("category", e.target.value)}
                      >
                        <option value="">Selecciona una categoría</option>
                        {CATEGORY_NAMES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="city" className="label">
                      Ciudad
                    </label>
                    <input
                      id="city"
                      className="input"
                      value={values.city}
                      onChange={(e) => set("city", e.target.value)}
                      placeholder="Lima"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="address" className="label">
                    Dirección (opcional)
                  </label>
                  <input
                    id="address"
                    className="input"
                    value={values.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Av. Ejemplo 123"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="label">Tipo de pago</label>
                  <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tipo de pago">
                    {(
                      [
                        { value: "fijo", label: "Monto fijo" },
                        { value: "por_hora", label: "Por hora" },
                        { value: "por_dia", label: "Por día" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={values.pay_type === opt.value}
                        onClick={() => set("pay_type", opt.value)}
                        className={cn(
                          "rounded-2xl border-2 px-3 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]",
                          values.pay_type === opt.value
                            ? "border-primary-600 bg-primary-50 text-primary-700 shadow-glow-sm"
                            : "border-slate-200 bg-white text-ink-muted hover:border-slate-300"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="pay_amount" className="label">
                    Pago (S/) — opcional
                  </label>
                  <input
                    id="pay_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={values.pay_amount}
                    onChange={(e) => set("pay_amount", e.target.value)}
                    placeholder="Ej. 100 (déjalo vacío para «a convenir»)"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="positions_needed" className="label">
                    Vacantes disponibles
                  </label>
                  <input
                    id="positions_needed"
                    type="number"
                    min="1"
                    className="input"
                    value={values.positions_needed}
                    onChange={(e) => set("positions_needed", e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-ink-muted">
                    ¿Cuántas personas necesitas para este trabajo?
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="overflow-hidden rounded-3xl border border-slate-100">
                <div className="h-1.5 bg-brand-gradient" aria-hidden />
                <div className="p-5">
                  <h3 className="text-lg font-extrabold tracking-tight text-ink">{values.title}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                    <MapPin className="h-4 w-4 text-primary-500" />
                    {values.category} · {values.city}
                    {values.address ? ` · ${values.address}` : ""}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {values.description}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-sm">
                    <span className="font-extrabold text-primary-600">
                      {formatCurrency(values.pay_amount ? Number(values.pay_amount) : null)}{" "}
                      <span className="font-medium text-ink-muted">
                        {payTypeLabel(values.pay_type)}
                      </span>
                    </span>
                    <span className="font-medium text-ink-muted">
                      {values.positions_needed}{" "}
                      {Number(values.positions_needed) === 1 ? "vacante" : "vacantes"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {(stepError || state.error) && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {stepError ?? state.error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={back} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Atrás
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary flex-1">
            Continuar
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <form action={formAction} className="flex flex-1">
            {/* El server action recibe los mismos campos del formulario original */}
            <input type="hidden" name="title" value={values.title} />
            <input type="hidden" name="description" value={values.description} />
            <input type="hidden" name="category" value={values.category} />
            <input type="hidden" name="city" value={values.city} />
            <input type="hidden" name="address" value={values.address} />
            <input type="hidden" name="pay_amount" value={values.pay_amount} />
            <input type="hidden" name="pay_type" value={values.pay_type} />
            <input type="hidden" name="positions_needed" value={values.positions_needed} />
            <SubmitButton />
          </form>
        )}
      </div>
    </div>
  );
}
