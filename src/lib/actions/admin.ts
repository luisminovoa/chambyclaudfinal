"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { computeAndSaveProfileStats } from "@/lib/actions/profile";
import { formatSupabaseError } from "@/lib/format-supabase-error";
import type {
  DocumentStatus,
  DocumentRejectionReason,
  VerificationDocument,
  VerificationDocumentReview,
  Profile,
  UserRole,
  WorkerProfileDetails,
  WorkerExperience,
  ProfilePhoto,
  ProfileStats,
  RatingSummary,
} from "@/lib/types";

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profileRaw } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const profile = profileRaw as unknown as { role: string } | null;
  if (profile?.role !== "admin") throw new Error("No autorizado");

  return { supabase, adminId: user.id };
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  revalidatePath("/admin/users");
  return { error: error?.message };
}

/**
 * profiles.role sigue siendo la fuente de verdad para autorización
 * (assertAdmin()/current_user_role() la leen directamente) — pero
 * switchRoleAction() (src/lib/actions/roles.ts) exige además una fila
 * ACTIVA en user_roles para el rol destino antes de dejar reactivarlo.
 * user_roles nunca puede recibir role='admin' desde el cliente
 * autenticado normal: user_roles_insert_own/update_own (0014_multi_
 * role.sql) lo bloquean a propósito, para que nadie pueda auto-asignarse
 * admin. Por eso esta escritura vía createAdminClient() (service role,
 * sí puede saltarse esas policies) es el único lugar legítimo donde se
 * crea/activa esa fila — y solo se alcanza pasando primero por
 * assertAdmin(), nunca por acción directa del cliente.
 *
 * Al promover a admin: se agrega/activa la fila 'admin' sin tocar
 * ninguna fila worker/employer existente — admin es aditivo, nunca
 * reemplaza el rol operativo que la cuenta ya tenía (0016_document_
 * verification_admin.sql / bug reportado: "no puedo volver a Admin").
 * Al degradar a alguien que YA era admin: se desactiva su fila 'admin'
 * en user_roles, para que switchRoleAction('admin') deje de encontrarla
 * — si no, el usuario degradado seguiría pudiendo reactivarse admin él
 * mismo aunque profiles.role ya no lo diga.
 */
export async function changeUserRole(userId: string, role: "worker" | "employer" | "admin") {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  const admin = createAdminClient();
  if (role === "admin") {
    const { data: existing } = await admin
      .from("user_roles")
      .select("id, active")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (existing) {
      if (!(existing as { active: boolean }).active) {
        await admin.from("user_roles").update({ active: true }).eq("id", (existing as { id: string }).id);
      }
    } else {
      await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
    }
  } else {
    await admin.from("user_roles").update({ active: false }).eq("user_id", userId).eq("role", "admin");
  }

  revalidatePath("/admin/users");
  return { error: undefined };
}

export async function adminDeleteJob(jobId: string) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  revalidatePath("/admin/jobs");
  return { error: error?.message };
}

const VALID_JOB_STATUSES = ["abierto", "en_progreso", "completado", "cancelado"];

export async function adminUpdateJobStatus(jobId: string, status: string) {
  if (!VALID_JOB_STATUSES.includes(status)) return { error: "Estado inválido." };
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
  revalidatePath("/admin/jobs");
  return { error: error?.message };
}

// ── Verificación de documentos ──────────────────────────────────────────────

export interface AdminVerificationDocument extends VerificationDocument {
  profile: Pick<Profile, "id" | "full_name" | "avatar_url" | "city"> | null;
}

export interface VerificationCounts {
  pending: number;
  verified: number;
  rejected: number;
}

/**
 * Bandeja de documentos. `docs_select_own_or_admin` (0016_document_
 * verification_admin.sql) ya permite a un admin leer todos los documentos
 * con el cliente de sesión normal — no hace falta el cliente admin/
 * service-role solo para listar.
 */
export async function listVerificationDocuments(
  filter: "all" | DocumentStatus = "pending"
): Promise<{ documents: AdminVerificationDocument[]; counts: VerificationCounts }> {
  const { supabase } = await assertAdmin();

  let query = supabase
    .from("verification_documents")
    .select("*, profile:profiles!verification_documents_profile_id_fkey(id,full_name,avatar_url,city)")
    .order("uploaded_at", { ascending: true });

  if (filter !== "all") query = query.eq("status", filter);

  const [{ data }, { count: pending }, { count: verified }, { count: rejected }] = await Promise.all([
    query,
    supabase.from("verification_documents").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("verification_documents").select("id", { count: "exact", head: true }).eq("status", "verified"),
    supabase.from("verification_documents").select("id", { count: "exact", head: true }).eq("status", "rejected"),
  ]);

  let documents = (data as unknown as AdminVerificationDocument[]) ?? [];

  // "Todos" mezcla los 3 estados — pendientes primero, luego el resto
  // por antigüedad. Los filtros individuales ya vienen ordenados por la
  // query (uploaded_at asc, cola FIFO).
  if (filter === "all") {
    documents = [...documents].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
    });
  }

  return {
    documents,
    counts: { pending: pending ?? 0, verified: verified ?? 0, rejected: rejected ?? 0 },
  };
}

export interface AdminVerificationDocumentDetail extends AdminVerificationDocument {
  documentUrl: string | null;
  reviews: (VerificationDocumentReview & { reviewer: { full_name: string } | null })[];
}

/**
 * Detalle + URL firmada del documento — mismo patrón que
 * getDocumentDownloadUrl() (src/lib/actions/profile.ts): el cliente
 * nunca llama a storage directamente, la URL firmada es de corta
 * duración (5 min, alcanza para revisar) y solo se genera después de
 * confirmar el rol admin server-side.
 */
export async function getVerificationDocumentDetail(
  documentId: string
): Promise<AdminVerificationDocumentDetail | null> {
  const { supabase } = await assertAdmin();

  const { data: doc } = await supabase
    .from("verification_documents")
    .select("*, profile:profiles!verification_documents_profile_id_fkey(id,full_name,avatar_url,city)")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return null;

  const { data: reviews } = await supabase
    .from("verification_document_reviews")
    .select("*, reviewer:profiles!verification_document_reviews_reviewed_by_fkey(full_name)")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("verification-documents")
    .createSignedUrl((doc as { storage_path: string }).storage_path, 300);

  return {
    ...(doc as AdminVerificationDocument),
    documentUrl: signed?.signedUrl ?? null,
    reviews: (reviews as AdminVerificationDocumentDetail["reviews"]) ?? [],
  };
}

interface ReviewOptions {
  rejectionReason?: DocumentRejectionReason;
  rejectionNote?: string;
}

/**
 * Aprueba o rechaza un documento pendiente. Solo transiciona documentos
 * en 'pending' — mismo criterio que job_applications
 * (`canDecide = ... && status === "pendiente"`, ApplicantRow.tsx):
 * evita revisar el mismo documento dos veces de forma inconsistente. La
 * condición `.eq("status", "pending")` en el UPDATE lo hace atómico —
 * si dos admins revisan a la vez, el segundo obtiene 0 filas afectadas
 * en vez de pisar la primera decisión.
 *
 * El trigger notify_document_status_changed() (0016) ya se encarga de
 * insertar la notificación y el registro de auditoría — esta función
 * solo actualiza el documento y recalcula badges/trust score.
 */
export async function reviewVerificationDocument(
  documentId: string,
  decision: "verified" | "rejected",
  options: ReviewOptions = {}
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, adminId } = await assertAdmin();

  if (decision === "rejected" && !options.rejectionReason) {
    return { error: "Selecciona un motivo de rechazo." };
  }

  const { data, error } = await supabase
    .from("verification_documents")
    .update({
      status: decision,
      rejection_reason: decision === "rejected" ? options.rejectionReason : null,
      rejection_note: decision === "rejected" ? (options.rejectionNote?.trim() || null) : null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      ...(decision === "verified" ? { verified_at: new Date().toISOString() } : {}),
    })
    .eq("id", documentId)
    .eq("status", "pending")
    .select("profile_id")
    .maybeSingle();

  if (error) return { error: formatSupabaseError(error, "reviewVerificationDocument") };
  if (!data) return { error: "Este documento ya fue revisado o no existe." };

  // Mismo cálculo que ya usa el trabajador en su propio dashboard — solo
  // se le pasa explícitamente de quién es el perfil a recalcular, ya que
  // quien ejecuta esto es el admin, no el dueño del documento.
  await computeAndSaveProfileStats((data as { profile_id: string }).profile_id);

  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${documentId}`);
  return { success: true };
}

// ── Ficha administrativa de usuario (/admin/users/[id]) ─────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminUserDocument extends VerificationDocument {
  documentUrl: string | null;
  reviewer: { full_name: string } | null;
}

export interface AdminUserDocumentReview extends VerificationDocumentReview {
  reviewer: { full_name: string } | null;
  document: { document_type: VerificationDocument["document_type"] } | null;
}

export interface AdminUserActivity {
  jobsPublished: number;
  jobsCompletedAsEmployer: number;
  jobsCompletedAsWorker: number;
  jobsInProgressAsWorker: number;
  applicationsSubmitted: number;
  ratingsReceived: number;
}

export interface AdminUserProfileDetail {
  profile: Profile;
  /** auth.users.email — profiles no almacena email, ver nota en getAdminUserProfile(). */
  email: string | null;
  userRoles: UserRole[];
  workerDetails: WorkerProfileDetails | null;
  experience: WorkerExperience[];
  photos: ProfilePhoto[];
  stats: ProfileStats | null;
  ratingSummary: RatingSummary | null;
  documents: AdminUserDocument[];
  documentReviews: AdminUserDocumentReview[];
  activity: AdminUserActivity;
}

/**
 * Ficha administrativa completa de un usuario (worker o employer) para
 * /admin/users/[id]. Reutiliza exactamente los mismos datos/tablas que ya
 * alimentan el perfil propio del trabajador (dashboard/worker/profile) y
 * los perfiles públicos (getWorkerPublicProfile/getEmployerPublicProfile)
 * — ninguna tabla ni columna nueva.
 *
 * Reparto de cliente por tabla (mismo criterio que getWorkerPublicProfile,
 * src/lib/actions/workers.ts): las tablas cuya policy SELECT ya incluye
 * `current_user_role() = 'admin'` (profiles, user_roles, worker_profile_
 * details, worker_experience, verification_documents,
 * verification_document_reviews, jobs, job_applications) se leen con el
 * cliente de sesión normal, ya autorizado por assertAdmin(). Solo
 * profile_photos y profile_stats (RLS SELECT owner-only, sin excepción
 * admin — 0010_professional_profile.sql) y el email (vive en auth.users,
 * no en profiles) requieren createAdminClient() — nunca antes de
 * assertAdmin(), nunca expuesto al cliente.
 *
 * Documentos: misma técnica que getVerificationDocumentDetail() — URL
 * firmada de 5 minutos generada server-side con el cliente admin, nunca
 * una URL pública. No se reutiliza getDocumentDownloadUrl() (src/lib/
 * actions/profile.ts) literalmente porque esa función solo sirve al
 * propio dueño del documento (`.eq("profile_id", user.id)`) — no puede
 * servir el documento de OTRO usuario aunque quien llame sea admin. Se
 * replica el mismo mecanismo de seguridad (signed URL de corta duración,
 * nunca bucket público), no la función.
 */
export async function getAdminUserProfile(profileId: string): Promise<AdminUserProfileDetail | null> {
  const { supabase } = await assertAdmin();

  if (typeof profileId !== "string" || !UUID_RE.test(profileId)) return null;

  try {
    return await fetchAdminUserProfile(supabase, profileId);
  } catch (err) {
    console.error("[getAdminUserProfile] excepción no capturada:", err);
    return null;
  }
}

async function fetchAdminUserProfile(
  supabase: ReturnType<typeof createClient>,
  profileId: string
): Promise<AdminUserProfileDetail | null> {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (!profileRow) return null;

  const admin = createAdminClient();

  const [
    userRolesRes,
    workerDetailsRes,
    experienceRes,
    photosRes,
    statsRes,
    ratingRes,
    documentsRes,
    jobsPublishedRes,
    jobsCompletedEmployerRes,
    jobsCompletedWorkerRes,
    jobsInProgressWorkerRes,
    applicationsRes,
    authUserRes,
  ] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", profileId).eq("active", true),
    supabase.from("worker_profile_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase
      .from("worker_experience")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_current", { ascending: false })
      .order("start_date", { ascending: false }),
    admin
      .from("profile_photos")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_primary", { ascending: false })
      .order("display_order", { ascending: true }),
    admin.from("profile_stats").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("rating_summary").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase
      .from("verification_documents")
      .select("*, reviewer:profiles!verification_documents_reviewed_by_fkey(full_name)")
      .eq("profile_id", profileId)
      .order("uploaded_at", { ascending: false }),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("employer_id", profileId),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("employer_id", profileId)
      .eq("status", "completado"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("assigned_worker_id", profileId)
      .eq("status", "completado"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("assigned_worker_id", profileId)
      .eq("status", "en_progreso"),
    supabase
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", profileId),
    // profiles no almacena email — vive en Supabase Auth (auth.users), solo
    // accesible server-side vía la Admin API con el cliente service-role.
    admin.auth.admin.getUserById(profileId),
  ]);

  const documents = (documentsRes.data as unknown as AdminUserDocument[]) ?? [];
  const documentIds = documents.map((d) => d.id);

  const { data: reviewsData } = documentIds.length
    ? await supabase
        .from("verification_document_reviews")
        .select(
          "*, reviewer:profiles!verification_document_reviews_reviewed_by_fkey(full_name), document:verification_documents(document_type)"
        )
        .in("document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] as AdminUserDocumentReview[] };

  // Signed URLs de corta duración, generadas después de confirmar rol
  // admin — nunca una URL pública permanente. Mismo TTL (5 min) que
  // getVerificationDocumentDetail().
  const signedUrls = await Promise.all(
    documents.map((d) =>
      admin.storage.from("verification-documents").createSignedUrl(d.storage_path, 300)
    )
  );
  const documentsWithUrls = documents.map((d, i) => ({
    ...d,
    documentUrl: signedUrls[i]?.data?.signedUrl ?? null,
  }));

  const ratingSummary = (ratingRes.data as unknown as RatingSummary | null) ?? null;

  return {
    profile: profileRow as Profile,
    email: authUserRes.data.user?.email ?? null,
    userRoles: ((userRolesRes.data ?? []) as { role: UserRole }[]).map((r) => r.role),
    workerDetails: (workerDetailsRes.data as WorkerProfileDetails | null) ?? null,
    experience: (experienceRes.data as WorkerExperience[]) ?? [],
    photos: (photosRes.data as ProfilePhoto[]) ?? [],
    stats: (statsRes.data as ProfileStats | null) ?? null,
    ratingSummary,
    documents: documentsWithUrls,
    documentReviews: (reviewsData as unknown as AdminUserDocumentReview[]) ?? [],
    activity: {
      jobsPublished: jobsPublishedRes.count ?? 0,
      jobsCompletedAsEmployer: jobsCompletedEmployerRes.count ?? 0,
      jobsCompletedAsWorker: jobsCompletedWorkerRes.count ?? 0,
      jobsInProgressAsWorker: jobsInProgressWorkerRes.count ?? 0,
      applicationsSubmitted: applicationsRes.count ?? 0,
      ratingsReceived: ratingSummary?.total_ratings ?? 0,
    },
  };
}
