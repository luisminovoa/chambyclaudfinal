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

export async function changeUserRole(userId: string, role: "worker" | "employer" | "admin") {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin/users");
  return { error: error?.message };
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
