"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

export async function saveJob(jobId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase
    .from("saved_jobs")
    .insert({ worker_id: user.id, job_id: jobId });

  if (error) {
    if (error.code === "23505") return { success: true }; // already saved
    return { error: "No se pudo guardar el trabajo." };
  }

  revalidatePath("/dashboard/worker/jobs");
  return { success: true };
}

export async function unsaveJob(jobId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase
    .from("saved_jobs")
    .delete()
    .eq("worker_id", user.id)
    .eq("job_id", jobId);

  if (error) return { error: "No se pudo eliminar el guardado." };

  revalidatePath("/dashboard/worker/jobs");
  return { success: true };
}
