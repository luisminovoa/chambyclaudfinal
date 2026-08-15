"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { ReportEvidence } from "@/lib/types";

/**
 * Fase 4, Partes A-D: flujo de evidencia adjunta a un reporte.
 * Reutiliza exactamente el patrón ya establecido en profile.ts
 * (createDocumentUploadUrl/saveVerificationDocument/
 * deleteVerificationDocument/getDocumentDownloadUrl para
 * verification-documents) — mismo bucket privado + signed URL,
 * mismo criterio de "el servidor construye el path, nunca el
 * cliente", mismo TTL corto (300s, igual que
 * getVerificationDocumentDetail() en admin.ts). No se crea ningún
 * bucket ni mecanismo de Storage nuevo — solo el bucket
 * `report-evidence` ya creado en 0019_user_reports_moderation.sql.
 */

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MIME_TO_EXT: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REPORT = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value: string): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

type Ok<T extends object = object> = { success: true } & T;
type Err = { error: string };
type ActionResult<T extends object = object> = Ok<T> | Err;

async function getAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Extensión declarada por el nombre de archivo debe ser consistente
 * con el content-type declarado — sin esto, un cliente podría llamar
 * con contentType='image/png' pero fileName='evidencia.pdf.exe' (o
 * similar) para intentar colar una extensión arbitraria en el
 * storage_path. No es sniffing real de magic bytes (esta sesión no
 * puede leer el contenido del archivo — el flujo de signed upload URL
 * nunca pasa los bytes por el servidor, mismo límite que
 * createDocumentUploadUrl() ya tiene hoy para verification-documents),
 * solo consistencia de metadata declarada por el cliente.
 */
function extensionMatchesMime(fileName: string, contentType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return (MIME_TO_EXT[contentType] ?? []).includes(ext);
}

interface ReportOwnershipRow {
  id: string;
  reporter_id: string;
  status: string;
}

async function loadOwnedPendingReport(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  userId: string
): Promise<{ report?: ReportOwnershipRow; error?: string }> {
  const { data } = await supabase
    .from("reports")
    .select("id, reporter_id, status")
    .eq("id", reportId)
    .eq("reporter_id", userId)
    .maybeSingle();

  const report = data as unknown as ReportOwnershipRow | null;
  // Mensaje idéntico para "no existe" y "no es tuyo" — no revela cuál de
  // los dos casos ocurrió (mismo criterio que deleteVerificationDocument()).
  if (!report) return { error: "Reporte no encontrado." };
  if (report.status !== "pending") {
    return { error: "Solo puedes adjuntar o quitar evidencia mientras el reporte sigue pendiente." };
  }
  return { report };
}

/**
 * Prepara la subida: valida sesión, propiedad del reporte, estado
 * 'pending', tipo/extensión de archivo, y el límite de 5 archivos —
 * antes de generar la signed upload URL. El path se construye aquí,
 * server-side, con el mismo prefijo que exige la policy de Storage
 * (0019: `auth.uid()::text = (storage.foldername(name))[1]`) — el
 * cliente nunca envía ni elige storage_path.
 */
export async function createReportEvidenceUploadUrl(
  reportId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<ActionResult<{ uploadUrl: string; storagePath: string }>> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  if (!isValidUuid(reportId)) return { error: "Reporte inválido." };
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return { error: "Solo se permiten imágenes (JPG, PNG, WebP) o PDF." };
  }
  if (!extensionMatchesMime(fileName, contentType)) {
    return { error: "La extensión del archivo no coincide con su tipo." };
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return { error: "El archivo no puede superar 10 MB." };
  }

  const { report, error: ownErr } = await loadOwnedPendingReport(supabase, reportId, user.id);
  if (!report) return { error: ownErr! };

  const { count } = await supabase
    .from("report_evidence")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);
  if ((count ?? 0) >= MAX_FILES_PER_REPORT) {
    return { error: `Ya adjuntaste el máximo de ${MAX_FILES_PER_REPORT} archivos para este reporte.` };
  }

  const ext = fileName.split(".").pop()!.toLowerCase();
  // reporterId/reportId/... — el primer segmento debe ser auth.uid()
  // para que report_evidence_storage_insert (0019) lo acepte; el
  // segundo acota el archivo a ESTE reporte específico, no solo a este
  // usuario (así saveReportEvidence puede validar el prefijo completo).
  const storagePath = `${user.id}/${reportId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("report-evidence")
    .createSignedUploadUrl(storagePath);

  if (error || !data) return { error: "No se pudo preparar la subida." };

  return { success: true, uploadUrl: data.signedUrl, storagePath };
}

/**
 * Registra la evidencia ya subida al bucket. Revalida ownership/estado
 * y el límite de archivos por si cambiaron entre la creación de la
 * signed URL y este llamado (dos pestañas, subida lenta, etc.) — no
 * confía en que createReportEvidenceUploadUrl() ya lo haya validado.
 * Si el INSERT falla después de que el archivo ya se subió al bucket,
 * se limpia el objeto para no dejarlo huérfano.
 */
export async function saveReportEvidence(params: {
  reportId: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}): Promise<ActionResult<{ evidence: ReportEvidence }>> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  if (!isValidUuid(params.reportId)) return { error: "Reporte inválido." };
  if (!ALLOWED_MIME_TYPES.includes(params.contentType)) {
    return { error: "Solo se permiten imágenes (JPG, PNG, WebP) o PDF." };
  }
  if (params.fileSize > MAX_FILE_SIZE_BYTES) {
    return { error: "El archivo no puede superar 10 MB." };
  }

  // El path debe estar exactamente dentro de la carpeta de ESTE
  // usuario y ESTE reporte — protección contra path traversal / que un
  // cliente reporte un storagePath ajeno para registrar una fila que
  // apunte al archivo de otro reporte.
  const expectedPrefix = `${user.id}/${params.reportId}/`;
  if (!params.storagePath.startsWith(expectedPrefix) || params.storagePath.includes("..")) {
    return { error: "Ruta de archivo inválida." };
  }

  const { report, error: ownErr } = await loadOwnedPendingReport(supabase, params.reportId, user.id);
  if (!report) return { error: ownErr! };

  const { count } = await supabase
    .from("report_evidence")
    .select("id", { count: "exact", head: true })
    .eq("report_id", params.reportId);
  if ((count ?? 0) >= MAX_FILES_PER_REPORT) {
    return { error: `Ya adjuntaste el máximo de ${MAX_FILES_PER_REPORT} archivos para este reporte.` };
  }

  const { data, error } = await supabase
    .from("report_evidence")
    .insert({
      report_id: params.reportId,
      storage_path: params.storagePath,
      file_name: params.fileName,
      content_type: params.contentType,
      file_size: params.fileSize,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    const admin = createAdminClient();
    await admin.storage.from("report-evidence").remove([params.storagePath]);

    // trg_report_evidence_limit (0024) es la garantía atómica real del
    // límite de 5 archivos — el conteo de arriba es solo un fallo rápido
    // que puede perder una condición de carrera entre dos subidas
    // concurrentes. Si el trigger rechazó el INSERT, se traduce al mismo
    // mensaje amigable que el chequeo de conteo, en vez del genérico.
    if (error.message?.includes("report_evidence_limit_exceeded")) {
      return { error: `Ya adjuntaste el máximo de ${MAX_FILES_PER_REPORT} archivos para este reporte.` };
    }
    return { error: "No se pudo registrar la evidencia. Intenta de nuevo." };
  }

  return { success: true, evidence: data as ReportEvidence };
}

/** Evidencia del propio reporte del reportante — sin signed URL (se pide aparte, bajo demanda). */
export async function getReportEvidence(reportId: string): Promise<ReportEvidence[]> {
  const { supabase, user } = await getAuth();
  if (!user || !isValidUuid(reportId)) return [];

  const { data } = await supabase
    .from("report_evidence")
    .select("*")
    .eq("report_id", reportId)
    .eq("uploaded_by", user.id)
    .order("created_at", { ascending: true });

  return (data as unknown as ReportEvidence[]) ?? [];
}

/**
 * Solo el reportante, y solo mientras el reporte sigue 'pending' — una
 * vez que pasa a under_review, la evidencia bajo revisión no debe
 * poder alterarse. Reforzado en dos capas: el chequeo explícito de
 * abajo (mensaje claro) y la policy RLS de 0022
 * (report_evidence_delete_own_pending), que bloquea el DELETE aunque
 * esta función tuviera un bug.
 */
export async function deleteReportEvidence(evidenceId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };
  if (!isValidUuid(evidenceId)) return { error: "Evidencia inválida." };

  const { data } = await supabase
    .from("report_evidence")
    .select("id, storage_path, report_id, uploaded_by")
    .eq("id", evidenceId)
    .eq("uploaded_by", user.id)
    .maybeSingle();

  const evidence = data as { id: string; storage_path: string; report_id: string } | null;
  if (!evidence) return { error: "Evidencia no encontrada." };

  const { report, error: ownErr } = await loadOwnedPendingReport(supabase, evidence.report_id, user.id);
  if (!report) return { error: ownErr! };

  const admin = createAdminClient();
  await admin.storage.from("report-evidence").remove([evidence.storage_path]);

  const { error } = await supabase.from("report_evidence").delete().eq("id", evidenceId);
  if (error) return { error: "No se pudo eliminar la evidencia." };

  return { success: true };
}

/**
 * Signed URL de corta duración (5 min, igual que el resto del panel
 * admin) — compartida entre reportante (su propia evidencia) y admin
 * (cualquier evidencia). Nunca se persiste la URL firmada en la base
 * de datos; se genera bajo demanda en cada llamado. El usuario
 * reportado nunca puede llegar aquí con éxito: no es `uploaded_by` ni
 * es admin, así que cae en la rama de "no autorizado".
 */
export async function getReportEvidenceSignedUrl(
  evidenceId: string
): Promise<ActionResult<{ url: string; fileName: string; contentType: string }>> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };
  if (!isValidUuid(evidenceId)) return { error: "Evidencia inválida." };

  const { data } = await supabase
    .from("report_evidence")
    .select("id, storage_path, file_name, content_type, uploaded_by")
    .eq("id", evidenceId)
    .maybeSingle();

  const evidence = data as {
    storage_path: string;
    file_name: string;
    content_type: string;
    uploaded_by: string;
  } | null;
  if (!evidence) return { error: "Evidencia no encontrada." };

  const isOwner = evidence.uploaded_by === user.id;
  let isAdmin = false;
  if (!isOwner) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = (profile as { role: string } | null)?.role === "admin";
  }
  if (!isOwner && !isAdmin) return { error: "No autorizado." };

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("report-evidence")
    .createSignedUrl(evidence.storage_path, 300);

  if (error || !signed) return { error: "No se pudo generar el enlace." };

  return {
    success: true,
    url: signed.signedUrl,
    fileName: evidence.file_name,
    contentType: evidence.content_type,
  };
}
