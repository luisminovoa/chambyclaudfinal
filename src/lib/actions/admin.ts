"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

const { data: profileRaw } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const profile = profileRaw as unknown as { role: string } | null;
  if (profile?.role !== "admin") throw new Error("No autorizado");

  return supabase;
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  revalidatePath("/admin/users");
  return { error: error?.message };
}

export async function changeUserRole(userId: string, role: "worker" | "employer" | "admin") {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin/users");
  return { error: error?.message };
}

export async function adminDeleteJob(jobId: string) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  revalidatePath("/admin/jobs");
  return { error: error?.message };
}

const VALID_JOB_STATUSES = ["abierto", "en_progreso", "completado", "cancelado"];

export async function adminUpdateJobStatus(jobId: string, status: string) {
  if (!VALID_JOB_STATUSES.includes(status)) return { error: "Estado inválido." };
  const supabase = await assertAdmin();
  const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
  revalidatePath("/admin/jobs");
  return { error: error?.message };
}
