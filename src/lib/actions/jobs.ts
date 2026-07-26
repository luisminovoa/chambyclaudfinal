"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

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
const applicationStatusSchema = z.enum(["pendiente", "aceptado", "rechazado", "retirado"]);

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
