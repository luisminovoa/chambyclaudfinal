"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, ProfileStats, RatingSummary } from "@/lib/types";

export interface EmployerPublicProfile {
  profile: Profile;
  stats: ProfileStats | null;
  ratingSummary: RatingSummary | null;
  jobsPublished: number;
}

/**
 * Perfil público de un empleador — a diferencia de getWorkerPublicProfile()
 * (src/lib/actions/workers.ts), no requiere ninguna relación con quien mira:
 * profiles/jobs/rating_summary ya son de lectura pública a nivel de RLS
 * ("profiles_select_all"/"jobs_select_all" con `using (true)`, ver
 * 0001_init.sql), y esta misma información (nombre, avatar, calificación
 * del empleador) ya se muestra sin restricción en /jobs/[id]. Solo
 * profile_stats (badges) sigue siendo owner-only por RLS, así que esa
 * lectura puntual usa el cliente admin — mismo patrón de
 * defense-in-depth que el resto del módulo de perfiles.
 */
export async function getEmployerPublicProfile(
  employerId: string
): Promise<EmployerPublicProfile | null> {
  try {
    return await fetchEmployerPublicProfile(employerId);
  } catch (err) {
    console.error("[getEmployerPublicProfile] excepción no capturada:", err);
    return null;
  }
}

async function fetchEmployerPublicProfile(
  employerId: string
): Promise<EmployerPublicProfile | null> {
  const supabase = createClient();

  // Filtra por role="employer" para que esta ruta solo sirva perfiles de
  // empleador — un worker/admin con ese id debe seguir siendo invisible
  // aquí, aunque profiles_select_all sea público a nivel de fila.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employerId)
    .eq("role", "employer")
    .maybeSingle();

  if (!profileRow) return null;

  const [statsRes, ratingRes, jobsCountRes] = await Promise.all([
    createAdminClient().from("profile_stats").select("*").eq("profile_id", employerId).maybeSingle(),
    supabase.from("rating_summary").select("*").eq("profile_id", employerId).maybeSingle(),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("employer_id", employerId),
  ]);

  return {
    profile: profileRow as Profile,
    stats: (statsRes.data as ProfileStats | null) ?? null,
    ratingSummary: (ratingRes.data as unknown as RatingSummary | null) ?? null,
    jobsPublished: jobsCountRes.count ?? 0,
  };
}
