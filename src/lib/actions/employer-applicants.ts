"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getWorkerPrimaryTitle } from "@/lib/profile-completion";
import type { PublicWorkerSummary, RatingSummary, WorkerProfileDetails } from "@/lib/types";

/**
 * Vista agregada de postulantes del empleador (PR 2). Responde "¿quién
 * postuló a cualquiera de mis publicaciones?", que hasta ahora solo se
 * podía contestar entrando publicación por publicación en /jobs/[id].
 *
 * NO reimplementa ninguna regla de negocio: aceptar/rechazar siguen
 * pasando por updateApplicationStatus() (src/lib/actions/jobs.ts), que
 * ya valida la transición y la propiedad de la publicación server-side,
 * y sigue disparando la cascada de contratación de la base de datos
 * (handle_application_accepted: asigna trabajador, pasa el job a
 * en_progreso, auto-rechaza las demás pendientes y abre el chat).
 *
 * Aislamiento entre empleadores: toda consulta se acota a los job_id
 * que pertenecen a auth.uid(), resueltos en el servidor. La RLS de
 * job_applications (0001_init.sql:265-272) ya lo exige, pero no se
 * delega en ella como única barrera — el filtro explícito es la
 * defensa primaria y la RLS queda como defensa en profundidad.
 */

/** Tope duro de resultados, mismo criterio que listReports() en admin-reports.ts. */
const MAX_APPLICANTS = 200;

const APPLICATION_STATUSES = ["pendiente", "aceptado", "rechazado", "retirado"];

export interface EmployerApplicantItem {
  /** id de la fila de job_applications */
  id: string;
  jobId: string;
  jobTitle: string;
  /**
   * Estado de la PUBLICACIÓN (no de la postulación). La página lo usa
   * para calcular `canManage` con el mismo criterio que /jobs/[id]:
   * solo una publicación 'abierto' admite aceptar/rechazar. Sin esto,
   * la UI ofrecería un botón que el trigger de la base de datos
   * rechazaría con "Este trabajo ya no acepta postulantes".
   */
  jobStatus: string;
  status: string;
  createdAt: string;
  worker: PublicWorkerSummary;
  occupation: string | null;
  ratingSummary: RatingSummary | null;
  /** FASE 3G (calendario) — horario propuesto/confirmado (0054). */
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  workerScheduleConfirmedAt: string | null;
}

export interface EmployerApplicantCounts {
  all: number;
  pendiente: number;
  aceptado: number;
  rechazado: number;
  retirado: number;
}

export interface EmployerJobOption {
  id: string;
  title: string;
  status: string;
}

export interface EmployerApplicantFilters {
  status?: string;
  jobId?: string;
}

/**
 * Autorización por rol POSEÍDO (user_roles), no por modo activo
 * (profiles.role) — mismo criterio que /dashboard/employer/profile:
 * un usuario con worker+employer no pierde acceso a sus postulantes
 * solo por estar navegando en modo trabajador.
 */
async function assertEmployer() {
  const { user, userRoles } = await getCurrentUserAndProfile();
  if (!user) throw new Error("No autenticado");
  if (!userRoles.includes("employer")) throw new Error("No autorizado");
  return { user };
}

/** Publicaciones del empleador — la lista blanca de job_id de todo este módulo. */
async function getOwnJobs(): Promise<EmployerJobOption[]> {
  const { user } = await assertEmployer();
  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false });
  return (data as unknown as EmployerJobOption[]) ?? [];
}

/** Publicaciones propias, para poblar el selector de filtro por publicación. */
export async function listEmployerJobOptions(): Promise<EmployerJobOption[]> {
  return getOwnJobs();
}

export async function getEmployerApplicantCounts(): Promise<EmployerApplicantCounts> {
  const jobs = await getOwnJobs();
  const empty: EmployerApplicantCounts = {
    all: 0,
    pendiente: 0,
    aceptado: 0,
    rechazado: 0,
    retirado: 0,
  };
  if (jobs.length === 0) return empty;

  const supabase = createClient();
  const { data } = await supabase
    .from("job_applications")
    .select("status")
    .in(
      "job_id",
      jobs.map((j) => j.id)
    );

  const rows = (data as unknown as { status: string }[]) ?? [];
  const counts = { ...empty, all: rows.length };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as keyof EmployerApplicantCounts] += 1;
    }
  }
  return counts;
}

export async function listEmployerApplicants(
  filters: EmployerApplicantFilters = {}
): Promise<EmployerApplicantItem[]> {
  const jobs = await getOwnJobs();
  if (jobs.length === 0) return [];

  const jobById = new Map(jobs.map((j) => [j.id, j]));

  // El jobId llega del cliente (searchParams): solo se acepta si está
  // entre las publicaciones propias. Un id ajeno no filtra "hacia otro
  // empleador", devuelve vacío.
  let jobIds = jobs.map((j) => j.id);
  if (filters.jobId) {
    if (!jobById.has(filters.jobId)) return [];
    jobIds = [filters.jobId];
  }

  const supabase = createClient();
  let query = supabase
    .from("job_applications")
    .select(
      "id, job_id, status, created_at, worker_id, proposed_start_at, proposed_end_at, worker_schedule_confirmed_at"
    )
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
    .limit(MAX_APPLICANTS);

  if (filters.status && APPLICATION_STATUSES.includes(filters.status)) {
    query = query.eq("status", filters.status);
  }

  const { data } = await query;
  const applications =
    (data as unknown as {
      id: string;
      job_id: string;
      status: string;
      created_at: string;
      worker_id: string;
      proposed_start_at: string | null;
      proposed_end_at: string | null;
      worker_schedule_confirmed_at: string | null;
    }[]) ?? [];

  if (applications.length === 0) return [];

  // Enriquecimiento en batch (nunca N+1), mismo patrón que la lista de
  // postulantes de /jobs/[id]: el perfil del trabajador y el título
  // profesional (worker_profile_details) son de un tercero para
  // auth.uid() — la RLS de profiles (0034_harden_profiles_public_access.sql)
  // ya no deja resolver un embed `profiles!fkey` para nadie que no sea
  // el propio dueño del perfil o un admin. Se leen con el cliente admin
  // y una lista blanca explícita de columnas — nunca select("*"), nunca
  // phone/business_ruc — solo DESPUÉS de haber confirmado arriba que
  // estas postulaciones pertenecen a publicaciones del usuario.
  const workerIds = applications.map((a) => a.worker_id);
  const admin = createAdminClient();
  const [workersRes, detailsRes, ratingsRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, avatar_url, category, city").in("id", workerIds),
    admin.from("worker_profile_details").select("*").in("profile_id", workerIds),
    supabase.from("rating_summary").select("*").in("profile_id", workerIds),
  ]);

  const workerById = new Map(
    ((workersRes.data as unknown as PublicWorkerSummary[]) ?? []).map((w) => [w.id, w])
  );
  const detailsByWorker = new Map(
    ((detailsRes.data as unknown as WorkerProfileDetails[]) ?? []).map((d) => [d.profile_id, d])
  );
  const ratingByWorker = new Map(
    ((ratingsRes.data as unknown as RatingSummary[]) ?? []).map((r) => [r.profile_id, r])
  );

  return applications
    .filter((a) => workerById.has(a.worker_id))
    .map((a) => ({
      id: a.id,
      jobId: a.job_id,
      jobTitle: jobById.get(a.job_id)?.title ?? "Publicación",
      jobStatus: jobById.get(a.job_id)?.status ?? "",
      status: a.status,
      createdAt: a.created_at,
      worker: workerById.get(a.worker_id)!,
      occupation: getWorkerPrimaryTitle(
        workerById.get(a.worker_id)!,
        detailsByWorker.get(a.worker_id) ?? null
      ),
      ratingSummary: ratingByWorker.get(a.worker_id) ?? null,
      proposedStartAt: a.proposed_start_at,
      proposedEndAt: a.proposed_end_at,
      workerScheduleConfirmedAt: a.worker_schedule_confirmed_at,
    }));
}
