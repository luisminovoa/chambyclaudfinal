"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function submitRating({
  jobId,
  ratedId,
  score,
  comment,
}: {
  jobId: string;
  ratedId: string;
  score: number;
  comment?: string;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Debes iniciar sesión para calificar." };

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { error: "La calificación debe ser un número entero entre 1 y 5." };
  }
  if (comment && comment.length > 1000) {
    return { error: "El comentario no puede superar los 1000 caracteres." };
  }

  // Derivar el rol en que fue calificada la persona (no confiar en el cliente)
  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id, assigned_worker_id")
    .eq("id", jobId)
    .single();

  if (!job) return { error: "Trabajo no encontrado." };

  const ratedAsRole: UserRole =
    ratedId === (job as { employer_id: string; assigned_worker_id: string | null }).assigned_worker_id
      ? "worker"
      : "employer";

  const { error } = await supabase.from("ratings").insert({
    job_id: jobId,
    rater_id: user.id,
    rated_id: ratedId,
    rated_as_role: ratedAsRole,
    score,
    comment: comment || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya calificaste a esta persona por este trabajo." };
    }
    return { error: "No se pudo registrar la calificación." };
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/worker");
  revalidatePath("/dashboard/employer");
  return { success: true };
}
