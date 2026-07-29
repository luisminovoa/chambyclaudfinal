"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type {
  ApplicationStatus,
  AssignmentStatus,
  JobStatus,
  Profile,
  ProfilePhoto,
  VerificationDocument,
} from "@/lib/types";

interface ApplicationContext {
  id: string;
  status: ApplicationStatus;
  worker_id: string;
  job_id: string;
  job: {
    id: string;
    employer_id: string;
    status: JobStatus;
    positions_needed: number;
    pay_amount: number | null;
  };
}

/** Loads an application and asserts the current user owns the parent job. */
async function loadOwnedApplication(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
  userId: string
): Promise<{ app?: ApplicationContext; error?: string }> {
  const { data } = await supabase
    .from("job_applications")
    .select(
      "id, status, worker_id, job_id, jobs!inner(id, employer_id, status, positions_needed, pay_amount)"
    )
    .eq("id", applicationId)
    .single();

  const row = data as unknown as
    | (Omit<ApplicationContext, "job"> & { jobs: ApplicationContext["job"] })
    | null;

  if (!row || !row.jobs) return { error: "Postulación no encontrada." };
  if (row.jobs.employer_id !== userId) return { error: "Sin permiso." };

  return { app: { ...row, job: row.jobs } };
}

function revalidateHiring(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/dashboard/employer/jobs/${jobId}/applications`);
  revalidatePath("/dashboard/employer");
  revalidatePath("/dashboard/employer/assignments");
  revalidatePath("/dashboard/worker");
  revalidatePath("/dashboard/worker/assignments");
}

// ── Preselección ──────────────────────────────────────────────────────────────

export async function shortlistApplication(applicationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { app, error } = await loadOwnedApplication(supabase, applicationId, user.id);
  if (error || !app) return { error };

  if (app.status !== "pendiente") {
    return { error: "Solo puedes preseleccionar postulaciones pendientes." };
  }

  const { error: updateError } = await supabase
    .from("job_applications")
    .update({ status: "preseleccionado" })
    .eq("id", applicationId);

  if (updateError) return { error: "No se pudo preseleccionar al postulante." };

  revalidateHiring(app.job_id);
  return { success: true };
}

export async function removeShortlist(applicationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { app, error } = await loadOwnedApplication(supabase, applicationId, user.id);
  if (error || !app) return { error };

  if (app.status !== "preseleccionado") {
    return { error: "Esta postulación no está preseleccionada." };
  }

  const { error: updateError } = await supabase
    .from("job_applications")
    .update({ status: "pendiente" })
    .eq("id", applicationId);

  if (updateError) return { error: "No se pudo quitar la preselección." };

  revalidateHiring(app.job_id);
  return { success: true };
}

// ── Contratación ──────────────────────────────────────────────────────────────

export async function hireWorker(applicationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { app, error } = await loadOwnedApplication(supabase, applicationId, user.id);
  if (error || !app) return { error };

  if (app.status !== "pendiente" && app.status !== "preseleccionado") {
    return { error: "Esta postulación ya no puede ser contratada." };
  }
  if (app.job.status !== "abierto" && app.job.status !== "en_progreso") {
    return { error: "Este trabajo ya no admite contrataciones." };
  }

  const positions = Math.max(app.job.positions_needed, 1);
  const { count: hiredCount } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("job_id", app.job_id)
    .eq("status", "aceptado");

  if ((hiredCount ?? 0) >= positions) {
    return { error: "Ya cubriste todas las vacantes de este trabajo." };
  }

  // El trigger handle_application_accepted() se encarga de jobs.status,
  // la conversación y el auto-rechazo cuando se cubren todas las vacantes.
  const { error: updateError } = await supabase
    .from("job_applications")
    .update({ status: "aceptado" })
    .eq("id", applicationId)
    .eq("status", app.status);

  if (updateError) {
    return { error: "No se pudo contratar al trabajador. Intenta nuevamente." };
  }

  const { error: assignmentError } = await supabase.from("job_assignments").insert({
    job_id: app.job_id,
    worker_id: app.worker_id,
    employer_id: user.id,
    application_id: app.id,
    status: "asignado",
    agreed_pay: app.job.pay_amount,
  });

  // 23505 = ya existe una asignación para este par trabajo/trabajador
  if (assignmentError && assignmentError.code !== "23505") {
    return { error: "Se aceptó la postulación pero falló crear la asignación." };
  }

  revalidateHiring(app.job_id);
  return { success: true };
}

export async function rejectApplication(applicationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { app, error } = await loadOwnedApplication(supabase, applicationId, user.id);
  if (error || !app) return { error };

  if (app.status !== "pendiente" && app.status !== "preseleccionado") {
    return { error: "Solo puedes rechazar postulaciones pendientes o preseleccionadas." };
  }

  const { error: updateError } = await supabase
    .from("job_applications")
    .update({ status: "rechazado" })
    .eq("id", applicationId);

  if (updateError) return { error: "No se pudo rechazar la postulación." };

  revalidateHiring(app.job_id);
  return { success: true };
}

// ── Ciclo de vida de la asignación ────────────────────────────────────────────

interface AssignmentContext {
  id: string;
  job_id: string;
  worker_id: string;
  employer_id: string;
  status: AssignmentStatus;
}

async function loadAssignment(
  supabase: ReturnType<typeof createClient>,
  assignmentId: string
): Promise<AssignmentContext | null> {
  const { data } = await supabase
    .from("job_assignments")
    .select("id, job_id, worker_id, employer_id, status")
    .eq("id", assignmentId)
    .single();
  return (data as unknown as AssignmentContext | null) ?? null;
}

/** El trabajador confirma que asistirá. */
export async function confirmAssignment(assignmentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment) return { error: "Contratación no encontrada." };
  if (assignment.worker_id !== user.id) return { error: "Sin permiso." };
  if (assignment.status !== "asignado") {
    return { error: "Esta contratación ya fue confirmada." };
  }

  const { error } = await supabase
    .from("job_assignments")
    .update({ status: "confirmado", confirmed_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { error: "No se pudo confirmar la contratación." };

  revalidateHiring(assignment.job_id);
  return { success: true };
}

/** El empleador marca el inicio del trabajo. */
export async function startAssignment(assignmentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment) return { error: "Contratación no encontrada." };
  if (assignment.employer_id !== user.id) return { error: "Sin permiso." };
  if (assignment.status !== "asignado" && assignment.status !== "confirmado") {
    return { error: "Esta contratación no puede iniciarse." };
  }

  const { error } = await supabase
    .from("job_assignments")
    .update({ status: "en_progreso", started_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { error: "No se pudo iniciar el trabajo." };

  await supabase
    .from("jobs")
    .update({ status: "en_progreso" })
    .eq("id", assignment.job_id)
    .eq("status", "abierto");

  revalidateHiring(assignment.job_id);
  return { success: true };
}

/** El empleador marca la asignación como completada. */
export async function completeAssignment(assignmentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment) return { error: "Contratación no encontrada." };
  if (assignment.employer_id !== user.id) return { error: "Sin permiso." };
  if (assignment.status === "completado") return { error: "Ya está completada." };
  if (assignment.status === "cancelado") return { error: "Esta contratación fue cancelada." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("job_assignments")
    .update({ status: "completado", completed_at: now })
    .eq("id", assignmentId);

  if (error) return { error: "No se pudo completar el trabajo." };

  // El trabajo se cierra solo cuando ninguna asignación sigue activa.
  const { count: activeCount } = await supabase
    .from("job_assignments")
    .select("id", { count: "exact", head: true })
    .eq("job_id", assignment.job_id)
    .in("status", ["asignado", "confirmado", "en_progreso"]);

  if ((activeCount ?? 0) === 0) {
    await supabase
      .from("jobs")
      .update({ status: "completado", completed_at: now })
      .eq("id", assignment.job_id);

    await supabase.from("job_state_history").insert({
      job_id: assignment.job_id,
      actor_id: user.id,
      new_status: "completado",
      notes: "Todas las contrataciones completadas",
    });
  }

  revalidateHiring(assignment.job_id);
  return { success: true };
}

/** Cualquiera de las dos partes cancela la contratación; la vacante se libera. */
export async function cancelAssignment(
  assignmentId: string,
  reason?: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment) return { error: "Contratación no encontrada." };
  if (assignment.employer_id !== user.id && assignment.worker_id !== user.id) {
    return { error: "Sin permiso." };
  }
  if (assignment.status === "completado") {
    return { error: "No puedes cancelar un trabajo ya completado." };
  }
  if (assignment.status === "cancelado") return { error: "Ya está cancelada." };

  const { error } = await supabase
    .from("job_assignments")
    .update({
      status: "cancelado",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason?.slice(0, 500) || null,
    })
    .eq("id", assignmentId);

  if (error) return { error: "No se pudo cancelar la contratación." };

  // Liberar la vacante: la postulación vuelve a estar disponible como rechazada
  // y el trabajo se reabre si ya no hay nadie contratado.
  await supabase
    .from("job_applications")
    .update({ status: "rechazado" })
    .eq("job_id", assignment.job_id)
    .eq("worker_id", assignment.worker_id)
    .eq("status", "aceptado");

  const { count: activeCount } = await supabase
    .from("job_assignments")
    .select("id", { count: "exact", head: true })
    .eq("job_id", assignment.job_id)
    .in("status", ["asignado", "confirmado", "en_progreso"]);

  if ((activeCount ?? 0) === 0) {
    await supabase
      .from("jobs")
      .update({ status: "abierto", assigned_worker_id: null })
      .eq("id", assignment.job_id)
      .eq("status", "en_progreso");
  }

  revalidateHiring(assignment.job_id);
  return { success: true };
}

// ── Perfil completo del postulante (modal del empleador) ──────────────────────

export interface WorkerFullProfile {
  profile: Profile;
  photos: Array<Pick<ProfilePhoto, "id" | "public_url" | "is_primary" | "display_order">>;
  documents: Array<Pick<VerificationDocument, "id" | "document_type" | "verified_at">>;
  completedJobs: number;
  averageRating: number | null;
  totalRatings: number;
  recentRatings: Array<{ score: number; comment: string | null; created_at: string }>;
}

/**
 * Las políticas RLS de profile_photos y verification_documents solo permiten al
 * dueño leer sus filas, así que el empleador necesita el cliente de servicio.
 * Por eso se exponen únicamente campos no sensibles: nunca storage_path ni
 * file_name de los documentos, solo el tipo y si están verificados.
 */
export async function getWorkerFullProfile(
  workerId: string
): Promise<{ data?: WorkerFullProfile; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  // Solo un empleador con una postulación de este trabajador puede verlo.
  const { count: linkCount } = await supabase
    .from("job_applications")
    .select("id, jobs!inner(employer_id)", { count: "exact", head: true })
    .eq("worker_id", workerId)
    .eq("jobs.employer_id", user.id);

  if ((linkCount ?? 0) === 0) return { error: "Sin permiso." };

  const admin = createAdminClient();

  const [profileRes, photosRes, docsRes, completedRes, ratingsRes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", workerId).single(),
    admin
      .from("profile_photos")
      .select("id, public_url, is_primary, display_order")
      .eq("profile_id", workerId)
      .order("display_order"),
    admin
      .from("verification_documents")
      .select("id, document_type, verified_at")
      .eq("profile_id", workerId)
      .eq("status", "verified"),
    admin
      .from("job_assignments")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", workerId)
      .eq("status", "completado"),
    admin
      .from("ratings")
      .select("score, comment, created_at")
      .eq("rated_id", workerId)
      .eq("rated_as_role", "worker")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!profileRes.data) return { error: "Perfil no encontrado." };

  const { data: summary } = await admin
    .from("worker_rating_summary")
    .select("average_score, total_ratings")
    .eq("profile_id", workerId)
    .maybeSingle();

  const typedSummary = summary as { average_score: number; total_ratings: number } | null;

  return {
    data: {
      profile: profileRes.data as unknown as Profile,
      photos: (photosRes.data ?? []) as WorkerFullProfile["photos"],
      documents: (docsRes.data ?? []) as WorkerFullProfile["documents"],
      completedJobs: completedRes.count ?? 0,
      averageRating: typedSummary?.average_score ?? null,
      totalRatings: typedSummary?.total_ratings ?? 0,
      recentRatings: (ratingsRes.data ?? []) as WorkerFullProfile["recentRatings"],
    },
  };
}
