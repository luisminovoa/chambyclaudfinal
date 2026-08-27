"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import { validateLocationInput } from "@/lib/ubigeo";
import { CATEGORY_NAMES } from "@/lib/categories";

const jobSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  description: z.string().min(20, "La descripción debe tener al menos 20 caracteres"),
  category: z.string().min(2, "Indica un puesto o categoría"),
  // Ubicación jerárquica Perú (Fase 1) — validación de existencia/pertenencia
  // real contra el catálogo (src/lib/ubigeo.ts) ocurre después del parseo,
  // zod aquí solo exige que los tres campos vengan no vacíos.
  department: z.string().min(2, "Selecciona un departamento"),
  province: z.string().min(2, "Selecciona una provincia"),
  district: z.string().min(2, "Selecciona un distrito"),
  address: z.string().optional(),
  pay_amount: z.coerce.number().positive().optional().or(z.literal("")),
  pay_type: z.enum(["por_hora", "por_dia", "fijo"]),
  positions_needed: z.coerce.number().int().min(1).default(1),
});

export async function createJob(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Debes iniciar sesión." };

  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    department: formData.get("department"),
    province: formData.get("province"),
    district: formData.get("district"),
    address: formData.get("address") || undefined,
    pay_amount: formData.get("pay_amount") || "",
    pay_type: formData.get("pay_type"),
    positions_needed: formData.get("positions_needed") || 1,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  // Fase 2.1 (auditoría C4-G9): zod solo exigía longitud mínima —
  // cualquier string de 2+ caracteres pasaba, aunque el <select> de
  // NewJobForm.tsx ya restringe la elección a CATEGORY_NAMES. Cierra la
  // misma brecha que updateProfile() para category de perfil.
  if (!CATEGORY_NAMES.includes(parsed.data.category)) {
    return { error: "Selecciona una categoría válida." };
  }

  const { pay_amount, department, province, district, ...rest } = parsed.data;

  const location = validateLocationInput({ department, province, district });
  if ("error" in location) return { error: location.error };
  if (!location.department || !location.province || !location.district) {
    return { error: "Selecciona departamento, provincia y distrito." };
  }

  const { error, data } = await supabase
    .from("jobs")
    .insert({
      ...rest,
      // `city` (NOT NULL) se mantiene por compatibilidad con el resto de
      // la app (búsqueda, `idx_jobs_city`, JobCard, etc.) — se refleja
      // desde el distrito, el nivel más específico ya elegido, en vez de
      // pedirle al empleador un campo redundante.
      city: location.district,
      department: location.department,
      province: location.province,
      district: location.district,
      pay_amount: pay_amount === "" ? null : pay_amount,
      employer_id: user.id,
    })
    .select("id")
    .single();

if (error) {
    return { error: "No se pudo publicar el trabajo. Intenta nuevamente." };
  }

  const newJob = data as unknown as { id: string };

  revalidatePath("/jobs");
  revalidatePath("/dashboard/employer");
  redirect(`/jobs/${newJob.id}`);
}

const jobStatusSchema = z.enum(["abierto", "en_progreso", "completado", "cancelado"]);
const applicationStatusSchema = z.enum(["pendiente", "aceptado", "rechazado", "retirado"]);

const ALLOWED_JOB_TRANSITIONS: Record<string, string[]> = {
  abierto: ["cancelado"],
  en_progreso: ["cancelado", "completado"],
};

export async function updateJobStatus(jobId: string, status: string) {
  const parsedStatus = jobStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Estado inválido." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("status, employer_id")
    .eq("id", jobId)
    .single();

  const typedJob = job as { status: string; employer_id: string } | null;
  if (!typedJob) return { error: "Trabajo no encontrado." };
  if (typedJob.employer_id !== user.id) return { error: "Sin permiso." };
  if (!ALLOWED_JOB_TRANSITIONS[typedJob.status]?.includes(parsedStatus.data)) {
    return { error: "Esa transición de estado no está permitida." };
  }

  const { error } = await supabase.from("jobs").update({ status: parsedStatus.data }).eq("id", jobId);
  if (!error) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/dashboard/employer");
    revalidatePath("/dashboard/worker");
  }
  return { error: error?.message };
}

export async function completeJob(jobId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("status, employer_id")
    .eq("id", jobId)
    .single();

  const typedJob = job as { status: string; employer_id: string } | null;
  if (!typedJob) return { error: "Trabajo no encontrado." };
  if (typedJob.employer_id !== user.id) return { error: "Sin permiso." };
  if (typedJob.status !== "en_progreso") return { error: "El trabajo no está en progreso." };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ status: "completado", completed_at: now })
    .eq("id", jobId);

  if (updateError) return { error: "No se pudo completar el trabajo." };

  await supabase.from("job_state_history").insert({
    job_id: jobId,
    actor_id: user.id,
    prev_status: "en_progreso",
    new_status: "completado",
    notes: "Trabajo marcado como completado por el empleador",
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/employer");
  revalidatePath("/dashboard/worker");
  return { success: true };
}

export async function cancelJob(jobId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("status, employer_id")
    .eq("id", jobId)
    .single();

  const typedJob = job as { status: string; employer_id: string } | null;
  if (!typedJob) return { error: "Trabajo no encontrado." };
  if (typedJob.employer_id !== user.id) return { error: "Sin permiso." };
  if (typedJob.status !== "abierto") return { error: "Solo puedes cancelar trabajos abiertos." };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ status: "cancelado", cancelled_at: now })
    .eq("id", jobId);

  if (updateError) return { error: "No se pudo cancelar el trabajo." };

  await supabase.from("job_state_history").insert({
    job_id: jobId,
    actor_id: user.id,
    prev_status: "abierto",
    new_status: "cancelado",
    notes: "Trabajo cancelado por el empleador",
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/employer");
  return { success: true };
}

export async function withdrawApplication(applicationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: app } = await supabase
    .from("job_applications")
    .select("status, worker_id, job_id")
    .eq("id", applicationId)
    .single();

  const typedApp = app as { status: string; worker_id: string; job_id: string } | null;
  if (!typedApp) return { error: "Postulación no encontrada." };
  if (typedApp.worker_id !== user.id) return { error: "Sin permiso." };
  if (typedApp.status !== "pendiente") return { error: "Solo puedes retirar postulaciones pendientes." };

  const { error } = await supabase
    .from("job_applications")
    .update({ status: "retirado" })
    .eq("id", applicationId);

  if (error) return { error: "No se pudo retirar la postulación." };

  revalidatePath(`/jobs/${typedApp.job_id}`);
  revalidatePath("/dashboard/worker");
  return { success: true };
}

export async function deleteJob(jobId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  revalidatePath("/dashboard/employer");
  revalidatePath("/jobs");
  return { error: error?.message };
}

export async function applyToJob(jobId: string, message: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Debes iniciar sesión para postular." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", jobId)
    .single();

  const typedJob = job as { employer_id: string } | null;
  if (!typedJob) return { error: "Trabajo no encontrado." };
  if (typedJob.employer_id === user.id) {
    return { error: "No puedes postular a tu propio trabajo." };
  }

  const { error } = await supabase.from("job_applications").insert({
    job_id: jobId,
    worker_id: user.id,
    message: message || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya postulaste a este trabajo." };
    }
    return { error: "No se pudo enviar tu postulación." };
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/worker");
  return { success: true };
}

export async function updateApplicationStatus(applicationId: string, status: string) {
  const parsedStatus = applicationStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Estado inválido." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: app } = await supabase
    .from("job_applications")
    .select("status, worker_id, job_id")
    .eq("id", applicationId)
    .single();

  const typedApp = app as { status: string; worker_id: string; job_id: string } | null;
  if (!typedApp) return { error: "Postulación no encontrada." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", typedApp.job_id)
    .single();

  const typedJob = job as { employer_id: string } | null;
  const isWorker = typedApp.worker_id === user.id;
  const isEmployer = typedJob?.employer_id === user.id;

  const allowed =
    typedApp.status === "pendiente" &&
    ((isWorker && parsedStatus.data === "retirado") ||
      (isEmployer && ["aceptado", "rechazado"].includes(parsedStatus.data)));

  if (!allowed) return { error: "Esa transición de estado no está permitida." };

  const { error, data } = await supabase
    .from("job_applications")
    .update({ status: parsedStatus.data })
    .eq("id", applicationId)
    .select("job_id")
    .single();

  const updated = data as unknown as { job_id: string } | null;

  if (!error && updated) {
    revalidatePath(`/jobs/${updated.job_id}`);
    revalidatePath("/dashboard/employer");
    // Vista agregada de postulantes: sin esto, aceptar/rechazar desde
    // ahí no refresca la lista (la fila quedaría con el estado viejo).
    revalidatePath("/dashboard/employer/applicants");
    revalidatePath("/dashboard/worker");
  }
  return { error: error?.message };
}
