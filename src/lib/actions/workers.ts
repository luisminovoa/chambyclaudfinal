"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type {
  Profile,
  WorkerProfileDetails,
  ProfilePhoto,
  WorkerExperience,
  ProfileStats,
  RatingSummary,
} from "@/lib/types";

export interface WorkerPublicProfile {
  profile: Profile;
  workerDetails: WorkerProfileDetails | null;
  photos: ProfilePhoto[];
  experience: WorkerExperience[];
  stats: ProfileStats | null;
  ratingSummary: RatingSummary | null;
  jobsCompleted: number;
  /** Contexto de la postulación, solo si se pidió con jobId y existe. */
  application: { id: string; status: string } | null;
  jobId: string | null;
  /** Chat ya existente para ese job (se crea solo al aceptar), si lo hay. */
  conversationId: string | null;
  /** true solo si quien mira es el empleador dueño de jobId — nunca el propio worker ni un admin. */
  viewerIsEmployer: boolean;
}

/**
 * Perfil público de un trabajador, visible para:
 * - el propio trabajador
 * - un admin
 * - un empleador que tiene una postulación de este worker en alguno de sus jobs
 *
 * No amplía ninguna policy RLS de profile_photos/worker_profile_details/
 * worker_experience/profile_stats (siguen siendo owner+admin-only) — la
 * autorización se verifica aquí, server-side, antes de usar el cliente
 * admin. Mismo patrón que getDocumentDownloadUrl() (src/lib/actions/
 * profile.ts): defense-in-depth acotado a la relación legítima, en vez
 * de una policy nueva de alcance amplio.
 *
 * Documentos de verificación (DNI, antecedentes) NO se exponen aquí —
 * solo el badge de verificación ya calculado (profile_stats.badges).
 * Ver docs/DISENO-MULTI-ROL.md y la auditoría del flujo de contratación:
 * mostrar el documento crudo a cualquier empleador es una decisión de
 * privacidad separada, no incluida en este alcance.
 */
export async function getWorkerPublicProfile(
  workerId: string,
  jobId?: string
): Promise<WorkerPublicProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = (viewerProfile as { role: string } | null)?.role === "admin";
  const isSelf = user.id === workerId;

  let authorized = isSelf || isAdmin;
  let application: { id: string; status: string } | null = null;

  if (!authorized) {
    // ¿Este worker postuló a algún job del usuario actual?
    const { data: appliedRow } = await supabase
      .from("job_applications")
      .select("id, status, job_id, jobs!inner(employer_id)")
      .eq("worker_id", workerId)
      .eq("jobs.employer_id", user.id)
      .limit(1)
      .maybeSingle();

    if (appliedRow) {
      authorized = true;
      application = { id: (appliedRow as { id: string }).id, status: (appliedRow as { status: string }).status };
    }
  }

  if (!authorized) return null;

  const admin = createAdminClient();

  const [profileRes, workerDetailsRes, photosRes, experienceRes, statsRes, ratingRes, completedRes] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", workerId).single(),
      admin.from("worker_profile_details").select("*").eq("profile_id", workerId).maybeSingle(),
      admin
        .from("profile_photos")
        .select("*")
        .eq("profile_id", workerId)
        .order("is_primary", { ascending: false })
        .order("display_order", { ascending: true }),
      admin
        .from("worker_experience")
        .select("*")
        .eq("profile_id", workerId)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false }),
      admin.from("profile_stats").select("*").eq("profile_id", workerId).maybeSingle(),
      supabase.from("rating_summary").select("*").eq("profile_id", workerId).maybeSingle(),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .eq("status", "completado"),
    ]);

  if (!profileRes.data) return null;

  // Si se pidió con jobId explícito, resuelve la postulación de ESE job
  // (puede diferir de la encontrada arriba, que solo prueba "algún job").
  let viewerIsEmployer = false;
  if (jobId) {
    if (isSelf || isAdmin) {
      const { data } = await supabase
        .from("job_applications")
        .select("id, status")
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .maybeSingle();
      application = (data as { id: string; status: string } | null) ?? null;
    } else {
      const { data } = await supabase
        .from("job_applications")
        .select("id, status, jobs!inner(employer_id)")
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .eq("jobs.employer_id", user.id)
        .maybeSingle();
      application = data
        ? { id: (data as { id: string }).id, status: (data as { status: string }).status }
        : null;
      viewerIsEmployer = Boolean(application);
    }
  }

  // Si ya existe un chat para este job (se crea al aceptar la
  // postulación — handle_application_accepted(), 0002_hiring_tracking.sql),
  // lo enlazamos directo. No se crea ningún chat nuevo aquí — abrir
  // conversación antes de aceptar es una decisión de negocio aparte,
  // fuera de este alcance.
  let conversationId: string | null = null;
  if (jobId && application) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();
    conversationId = (conv as { id: string } | null)?.id ?? null;
  }

  return {
    profile: profileRes.data as Profile,
    workerDetails: (workerDetailsRes.data as WorkerProfileDetails | null) ?? null,
    photos: (photosRes.data as ProfilePhoto[]) ?? [],
    experience: (experienceRes.data as WorkerExperience[]) ?? [],
    stats: (statsRes.data as ProfileStats | null) ?? null,
    ratingSummary: (ratingRes.data as unknown as RatingSummary | null) ?? null,
    jobsCompleted: completedRes.count ?? 0,
    application,
    jobId: jobId ?? null,
    conversationId,
    viewerIsEmployer,
  };
}
