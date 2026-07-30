"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { PayType } from "@/lib/types";

const jobSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  description: z.string().min(20, "La descripción debe tener al menos 20 caracteres"),
  category: z.string().min(2, "Indica un puesto o categoría"),
  city: z.string().min(2, "Indica una ciudad"),
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
    city: formData.get("city"),
    address: formData.get("address") || undefined,
    pay_amount: formData.get("pay_amount") || "",
    pay_type: formData.get("pay_type"),
    positions_needed: formData.get("positions_needed") || 1,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const { pay_amount, ...rest } = parsed.data;

  const { error, data } = await supabase
    .from("jobs")
    .insert({
      ...rest,
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
const applicationStatusSchema = z.enum(["pendiente", "preseleccionado", "aceptado", "rechazado", "retirado"]);

export async function updateJobStatus(jobId: string, status: string) {
  const parsedStatus = jobStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Estado inválido." };

  const supabase = createClient();
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

export async function deleteJob(jobId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id, status")
    .eq("id", jobId)
    .single();

  const typedJob = job as { employer_id: string; status: string } | null;
  if (!typedJob) return { error: "Trabajo no encontrado." };
  if (typedJob.employer_id !== user.id) return { error: "Sin permiso." };
  if (["en_progreso", "completado"].includes(typedJob.status)) {
    return { error: "No puedes eliminar un trabajo en progreso o completado." };
  }

  // Remove associated storage objects before deleting the record
  const { data: images } = await supabase
    .from("job_images")
    .select("storage_path")
    .eq("job_id", jobId);

  if (images && images.length > 0) {
    const adminClient = createAdminClient();
    const paths = (images as { storage_path: string }[]).map((i) => i.storage_path);
    await adminClient.storage.from("job-images").remove(paths);
  }

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: "No se pudo eliminar el trabajo." };

  revalidatePath("/dashboard/employer");
  revalidatePath("/jobs");
  return { success: true };
}

export async function applyToJob(jobId: string, message: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Debes iniciar sesión para postular." };

  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  const typedJobStatus = job as { status: string } | null;
  if (!typedJobStatus || typedJobStatus.status !== "abierto") {
    return { error: "Este trabajo no está disponible para postulaciones." };
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
    revalidatePath("/dashboard/worker");
  }
  return { error: error?.message };
}

// ── Wizard actions ─────────────────────────────────────────────────────────────

interface JobWizardData {
  title: string;
  description: string;
  category: string;
  city: string;
  district?: string;
  address?: string;
  work_date?: string;
  start_time?: string;
  estimated_duration?: string;
  pay_type: PayType;
  pay_amount?: string;
  positions_needed: string;
  urgency: "normal" | "urgente";
  requirements: string[];
  isDraft: boolean;
}

const wizardSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  description: z.string().min(20, "La descripción debe tener al menos 20 caracteres"),
  category: z.string().min(1, "Selecciona una categoría"),
  city: z.string().min(2, "Indica una ciudad"),
  pay_type: z.enum(["por_hora", "por_dia", "fijo"]),
  positions_needed: z.coerce.number().int().min(1, "Debe haber al menos 1 vacante"),
  urgency: z.enum(["normal", "urgente"]).default("normal"),
});

export async function createJobRecord(
  data: JobWizardData
): Promise<{ jobId?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const typedProfile = profile as { role: string } | null;
  if (!typedProfile || (typedProfile.role !== "employer" && typedProfile.role !== "admin")) {
    return { error: "Solo los empleadores pueden publicar trabajos." };
  }

  const parsed = wizardSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const { error, data: newJob } = await supabase
    .from("jobs")
    .insert({
      employer_id: user.id,
      title: data.title,
      description: data.description,
      category: data.category,
      city: data.city,
      district: data.district || null,
      address: data.address || null,
      work_date: data.work_date || null,
      start_time: data.start_time || null,
      estimated_duration: data.estimated_duration || null,
      pay_type: data.pay_type,
      pay_amount: data.pay_amount ? Number(data.pay_amount) : null,
      positions_needed: Number(data.positions_needed),
      urgency: data.urgency,
      requirements: data.requirements,
      status: data.isDraft ? "borrador" : "abierto",
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo guardar el trabajo. Intenta nuevamente." };

  const inserted = newJob as unknown as { id: string };
  revalidatePath("/jobs");
  revalidatePath("/dashboard/employer");
  return { jobId: inserted.id };
}

export async function getJobImageUploadUrl(
  jobId: string
): Promise<{ signedUrl?: string; path?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", jobId)
    .single();
  const typedJob = job as { employer_id: string } | null;
  if (!typedJob || typedJob.employer_id !== user.id) return { error: "Sin permiso." };

  const uuid = crypto.randomUUID();
  const path = `${jobId}/${uuid}.jpg`;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from("job-images")
    .createSignedUploadUrl(path);

  if (error || !data) return { error: "No se pudo generar la URL de subida." };
  return { signedUrl: data.signedUrl, path };
}

export async function saveJobImageRecord(
  jobId: string,
  storagePath: string,
  publicUrl: string,
  displayOrder: number
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", jobId)
    .single();
  const typedJob = job as { employer_id: string } | null;
  if (!typedJob || typedJob.employer_id !== user.id) return { error: "Sin permiso." };

  const { error } = await supabase.from("job_images").insert({
    job_id: jobId,
    storage_path: storagePath,
    public_url: publicUrl,
    display_order: displayOrder,
  });

  if (error) return { error: "No se pudo guardar la imagen." };
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function deleteJobImage(imageId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: img } = await supabase
    .from("job_images")
    .select("storage_path, job_id")
    .eq("id", imageId)
    .single();
  const typedImg = img as { storage_path: string; job_id: string } | null;
  if (!typedImg) return { error: "Imagen no encontrada." };

  // Verify the requesting user owns the job
  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", typedImg.job_id)
    .single();
  const typedJob = job as { employer_id: string } | null;
  if (!typedJob || typedJob.employer_id !== user.id) return { error: "Sin permiso." };

  const adminClient = createAdminClient();
  await adminClient.storage.from("job-images").remove([typedImg.storage_path]);

  const { error } = await supabase.from("job_images").delete().eq("id", imageId);
  if (error) return { error: "No se pudo eliminar la imagen." };

  revalidatePath(`/jobs/${typedImg.job_id}`);
  return { success: true };
}
