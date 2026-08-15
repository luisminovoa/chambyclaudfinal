"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, ProfileStats, RatingSummary, PayType } from "@/lib/types";

export interface EmployerOpenJob {
  id: string;
  title: string;
  city: string;
  pay_amount: number | null;
  pay_type: PayType;
}

export interface EmployerPublicProfile {
  profile: Profile;
  stats: ProfileStats | null;
  ratingSummary: RatingSummary | null;
  jobsPublished: number;
  jobsCompleted: number;
  hires: number;
  openJobs: EmployerOpenJob[];
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employerId)
    .maybeSingle();

  if (!profileRow) return null;

  // "¿Es empleador?" se decide contra user_roles (roles que POSEE la
  // cuenta), no contra profiles.role (el MODO ACTIVO, mutable en
  // cualquier momento vía switchRoleAction() — ver 0014_multi_role.sql).
  // Filtrar por profiles.role="employer" rompía este perfil en cuanto la
  // cuenta cambiaba su modo activo a worker: el empleador seguía siendo
  // el dueño real de sus jobs (jobs.employer_id no cambia), pero dejaba
  // de "existir" para esta consulta. user_roles no tiene policy SELECT
  // que permita leer la fila de OTRO usuario (user_roles_select_own,
  // 0014, es auth.uid()=user_id or admin) — se usa el cliente admin para
  // esta única comprobación puntual, mismo patrón de defense-in-depth ya
  // usado más abajo para profile_stats: no se expone ninguna columna de
  // user_roles al cliente, solo se usa para decidir si la fila de
  // profiles ya obtenida es visible en esta ruta.
  const { data: employerRoleRow } = await createAdminClient()
    .from("user_roles")
    .select("id")
    .eq("user_id", employerId)
    .eq("role", "employer")
    .eq("active", true)
    .maybeSingle();

  if (!employerRoleRow) return null;

  const [statsRes, ratingRes, jobsCountRes, jobsCompletedRes, hiresRes, openJobsRes] = await Promise.all([
    createAdminClient().from("profile_stats").select("*").eq("profile_id", employerId).maybeSingle(),
    supabase.from("rating_summary").select("*").eq("profile_id", employerId).maybeSingle(),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("employer_id", employerId),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("employer_id", employerId)
      .eq("status", "completado"),
    // "Número de contrataciones": postulaciones aceptadas en cualquiera de
    // los trabajos de este empleador — jobs!inner + filtro por employer_id,
    // mismo patrón que fetchWorkerPublicProfile() en workers.ts.
    supabase
      .from("job_applications")
      .select("id, jobs!inner(employer_id)", { count: "exact", head: true })
      .eq("jobs.employer_id", employerId)
      .eq("status", "aceptado"),
    supabase
      .from("jobs")
      .select("id, title, city, pay_amount, pay_type")
      .eq("employer_id", employerId)
      .eq("status", "abierto")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return {
    profile: profileRow as Profile,
    stats: (statsRes.data as ProfileStats | null) ?? null,
    ratingSummary: (ratingRes.data as unknown as RatingSummary | null) ?? null,
    jobsPublished: jobsCountRes.count ?? 0,
    jobsCompleted: jobsCompletedRes.count ?? 0,
    hires: hiresRes.count ?? 0,
    openJobs: (openJobsRes.data as unknown as EmployerOpenJob[]) ?? [],
  };
}
