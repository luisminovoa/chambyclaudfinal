"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";
import {
  FileText,
  MapPin,
  Wallet,
  Camera,
  Eye,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Check,
  ChevronDown,
  X,
  Plus,
  Save,
  Loader2,
  Clock,
  CalendarDays,
  Zap,
} from "lucide-react";
import {
  createJobRecord,
  getJobImageUploadUrl,
  saveJobImageRecord,
} from "@/lib/actions/jobs";
import { CATEGORY_NAMES } from "@/lib/categories";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { formatCurrency, payTypeLabel, cn } from "@/lib/utils";

const STEPS = [
  { title: "Información", icon: FileText },
  { title: "Ubicación", icon: MapPin },
  { title: "Pago y condiciones", icon: Wallet },
  { title: "Fotos", icon: Camera },
  { title: "Vista previa", icon: Eye },
] as const;

const stepSchemas = [
  // Step 0 — Información
  z.object({
    title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
    description: z.string().min(20, "La descripción debe tener al menos 20 caracteres"),
    category: z.string().min(1, "Selecciona una categoría"),
    city: z.string().min(2, "Indica una ciudad"),
  }),
  // Step 1 — Ubicación (all optional, no validation)
  null,
  // Step 2 — Pago y condiciones
  z.object({
    positions_needed: z.coerce
      .number()
      .int()
      .min(1, "Debe haber al menos 1 vacante"),
  }),
  // Step 3 — Fotos (no validation)
  null,
  // Step 4 — Vista previa (submit step)
  null,
];

interface FormValues {
  title: string;
  description: string;
  category: string;
  city: string;
  district: string;
  address: string;
  work_date: string;
  start_time: string;
  estimated_duration: string;
  pay_type: "por_hora" | "por_dia" | "fijo";
  pay_amount: string;
  positions_needed: string;
  urgency: "normal" | "urgente";
  requirements: string[];
}

const emptyValues: FormValues = {
  title: "",
  description: "",
  category: "",
  city: "",
  district: "",
  address: "",
  work_date: "",
  start_time: "",
  estimated_duration: "",
  pay_type: "fijo",
  pay_amount: "",
  positions_needed: "1",
  urgency: "normal",
  requirements: [],
};

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}

function xhrUpload(url: string, blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(blob);
  });
}

export function JobWizardForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [stepError, setStepError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [reqInput, setReqInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function addRequirement() {
    const tag = reqInput.trim();
    if (tag && !values.requirements.includes(tag)) {
      set("requirements", [...values.requirements, tag]);
    }
    setReqInput("");
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const toAdd = selected.slice(0, 5 - imageFiles.length);
    setImageFiles((prev) => [...prev, ...toAdd]);
    setImagePreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(idx: number) {
    URL.revokeObjectURL(imagePreviews[idx]);
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
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

  async function handleSubmit(isDraft: boolean) {
    setSubmitError(null);
    setIsSubmitting(true);
    setSubmitProgress(isDraft ? "Guardando borrador..." : "Publicando trabajo...");

    const result = await createJobRecord({ ...values, isDraft });

    if (result.error || !result.jobId) {
      setSubmitError(result.error ?? "Error desconocido. Intenta de nuevo.");
      setIsSubmitting(false);
      setSubmitProgress(null);
      return;
    }

    const jobId = result.jobId;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    for (let i = 0; i < imageFiles.length; i++) {
      setSubmitProgress(`Subiendo foto ${i + 1} de ${imageFiles.length}...`);
      try {
        const urlResult = await getJobImageUploadUrl(jobId);
        if (!urlResult.signedUrl || !urlResult.path) continue;
        const compressed = await compressImage(imageFiles[i]);
        const ok = await xhrUpload(urlResult.signedUrl, compressed);
        if (ok) {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/job-images/${urlResult.path}`;
          await saveJobImageRecord(jobId, urlResult.path, publicUrl, i);
        }
      } catch {
        // Non-fatal: job was created; image upload failure doesn't block redirect
      }
    }

    setSubmitProgress("Listo, redirigiendo...");
    router.push(`/jobs/${jobId}`);
  }

  const CurrentIcon = STEPS[step].icon;

  return (
    <div>
      {/* Step indicator */}
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
            {/* ── Step 0: Información básica ── */}
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
                    placeholder="Describe las tareas, horario y lo que necesitas..."
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
              </div>
            )}

            {/* ── Step 1: Ubicación y fecha ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="district" className="label">
                      Distrito{" "}
                      <span className="font-normal text-ink-muted">(opcional)</span>
                    </label>
                    <input
                      id="district"
                      className="input"
                      value={values.district}
                      onChange={(e) => set("district", e.target.value)}
                      placeholder="Ej. Miraflores"
                    />
                  </div>
                  <div>
                    <label htmlFor="address" className="label">
                      Dirección{" "}
                      <span className="font-normal text-ink-muted">(opcional)</span>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="work_date" className="label">
                      <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                      Fecha de trabajo{" "}
                      <span className="font-normal text-ink-muted">(opcional)</span>
                    </label>
                    <input
                      id="work_date"
                      type="date"
                      className="input"
                      value={values.work_date}
                      onChange={(e) => set("work_date", e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="start_time" className="label">
                      <Clock className="mr-1 inline h-3.5 w-3.5" />
                      Hora de inicio{" "}
                      <span className="font-normal text-ink-muted">(opcional)</span>
                    </label>
                    <input
                      id="start_time"
                      type="time"
                      className="input"
                      value={values.start_time}
                      onChange={(e) => set("start_time", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="estimated_duration" className="label">
                    Duración estimada{" "}
                    <span className="font-normal text-ink-muted">(opcional)</span>
                  </label>
                  <input
                    id="estimated_duration"
                    className="input"
                    value={values.estimated_duration}
                    onChange={(e) => set("estimated_duration", e.target.value)}
                    placeholder="Ej. 4 horas, 2 días, todo el día"
                  />
                </div>
              </div>
            )}

            {/* ── Step 2: Pago y condiciones ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="label">Tipo de pago</label>
                  <div
                    className="grid grid-cols-3 gap-3"
                    role="radiogroup"
                    aria-label="Tipo de pago"
                  >
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
                    Pago (S/) —{" "}
                    <span className="font-normal text-ink-muted">opcional</span>
                  </label>
                  <input
                    id="pay_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={values.pay_amount}
                    onChange={(e) => set("pay_amount", e.target.value)}
                    placeholder="Déjalo vacío para «a convenir»"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="positions_needed" className="label">
                      Vacantes
                    </label>
                    <input
                      id="positions_needed"
                      type="number"
                      min="1"
                      className="input"
                      value={values.positions_needed}
                      onChange={(e) => set("positions_needed", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Urgencia</label>
                    <div className="flex gap-3" role="radiogroup" aria-label="Urgencia">
                      {(
                        [
                          { value: "normal", label: "Normal" },
                          { value: "urgente", label: "Urgente" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={values.urgency === opt.value}
                          onClick={() => set("urgency", opt.value)}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 px-3 py-3.5 text-sm font-semibold transition-all duration-200",
                            values.urgency === opt.value
                              ? opt.value === "urgente"
                                ? "border-warning-500 bg-warning-50 text-warning-700"
                                : "border-primary-600 bg-primary-50 text-primary-700"
                              : "border-slate-200 bg-white text-ink-muted hover:border-slate-300"
                          )}
                        >
                          {opt.value === "urgente" && <Zap className="h-3.5 w-3.5" />}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">
                    Requisitos{" "}
                    <span className="font-normal text-ink-muted">(opcional)</span>
                  </label>
                  {values.requirements.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {values.requirements.map((req) => (
                        <Badge key={req} tone="primary" className="cursor-default">
                          {req}
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "requirements",
                                values.requirements.filter((r) => r !== req)
                              )
                            }
                            className="ml-0.5 rounded-full hover:text-primary-900"
                            aria-label={`Eliminar ${req}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      value={reqInput}
                      onChange={(e) => setReqInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addRequirement();
                        }
                      }}
                      placeholder="Ej. Experiencia 2 años (Enter para agregar)"
                    />
                    <button
                      type="button"
                      onClick={addRequirement}
                      className="btn-secondary shrink-0 !px-3"
                      aria-label="Agregar requisito"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Un requisito a la vez. Presiona Enter o la coma para agregar.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 3: Fotos ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imagePreviews.map((src, i) => (
                    <div
                      key={i}
                      className="relative aspect-video overflow-hidden rounded-2xl bg-slate-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Foto ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                        aria-label={`Eliminar foto ${i + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {imageFiles.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-video items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-ink-muted transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-500"
                    >
                      <Camera className="h-8 w-8" />
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={handleImageChange}
                  aria-label="Seleccionar fotos"
                />
                <p className="text-xs text-ink-muted">
                  Hasta 5 fotos · Se comprimen a 1200 px automáticamente · Las fotos son
                  opcionales.
                </p>
              </div>
            )}

            {/* ── Step 4: Vista previa ── */}
            {step === 4 && (
              <div className="overflow-hidden rounded-3xl border border-slate-100">
                <div className="h-1.5 bg-brand-gradient" aria-hidden />
                <div className="space-y-4 p-5">
                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight text-ink">
                      {values.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                      <MapPin className="h-4 w-4 text-primary-500" />
                      {values.category} · {values.city}
                      {values.district ? `, ${values.district}` : ""}
                      {values.address ? ` · ${values.address}` : ""}
                    </p>
                  </div>

                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {values.description}
                  </p>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Badge tone="primary">
                      {formatCurrency(values.pay_amount ? Number(values.pay_amount) : null)}{" "}
                      {payTypeLabel(values.pay_type)}
                    </Badge>
                    <Badge tone="neutral">
                      {values.positions_needed}{" "}
                      {Number(values.positions_needed) === 1 ? "vacante" : "vacantes"}
                    </Badge>
                    {values.urgency === "urgente" && (
                      <Badge tone="warning">
                        <Zap className="h-3 w-3" />
                        Urgente
                      </Badge>
                    )}
                    {values.work_date && (
                      <Badge tone="info">
                        <CalendarDays className="h-3 w-3" />
                        {values.work_date}
                      </Badge>
                    )}
                    {values.start_time && (
                      <Badge tone="neutral">
                        <Clock className="h-3 w-3" />
                        {values.start_time}
                      </Badge>
                    )}
                    {values.estimated_duration && (
                      <Badge tone="neutral">
                        <Clock className="h-3 w-3" />
                        {values.estimated_duration}
                      </Badge>
                    )}
                  </div>

                  {values.requirements.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Requisitos
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {values.requirements.map((r) => (
                          <Badge key={r} tone="neutral">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {imagePreviews.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Fotos ({imagePreviews.length})
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {imagePreviews.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt=""
                            className="h-16 w-24 shrink-0 rounded-xl object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error messages */}
      {(stepError || submitError) && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {stepError ?? submitError}
        </div>
      )}

      {submitProgress && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {submitProgress}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        {step > 0 && !isSubmitting && (
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
          <div className="flex flex-1 gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(true)}
              className="btn-secondary flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(false)}
              className="btn-primary flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Publicar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
