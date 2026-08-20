"use server";

import { assertAdmin } from "@/lib/actions/assert-admin";
import { REPORT_STATUS_TRANSITIONS } from "@/lib/report-config";
import type {
  Report,
  ReportStatus,
  ReportTargetType,
  ReportReason,
  ModerationAction,
  ModerationActionType,
  Profile,
} from "@/lib/types";

/**
 * Fase 3: panel administrativo completo de reportes/moderación.
 * Reutiliza assertAdmin() (mismo helper que admin.ts/beta.ts/reports.ts
 * de Fase 1-2) y el patrón de enriquecimiento manual "batch-fetch + Map"
 * ya usado en getAdminUserProfile() (admin.ts) — NO se usan joins
 * embebidos con `!constraint_fkey` aquí: `reports` tiene dos columnas
 * distintas que referencian `profiles` (reporter_id, reported_user_id)
 * en la misma tabla, y esta sesión no tiene acceso a un Postgres real
 * para confirmar el comportamiento exacto de PostgREST con dos hints de
 * FK a la misma tabla en una sola consulta — se prefiere el camino
 * conservador: consultas `.in()` simples cuya estructura ya está
 * confirmada (profiles.id/full_name/avatar_url/city/role, jobs.id/
 * title — ambas ya usadas en el resto del código), combinadas en
 * memoria con un Map. Sin sanciones automáticas: recordModerationAction()
 * únicamente inserta el registro de auditoría, nunca llama a
 * toggleUserActive() ni ninguna otra función con efecto real — esa
 * integración queda fuera de alcance de esta fase (ver prompt Fase 3,
 * punto 7).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

const VALID_REPORT_STATUSES: ReportStatus[] = ["pending", "under_review", "resolved", "dismissed"];

type ProfileSummary = Pick<Profile, "id" | "full_name" | "avatar_url" | "city" | "role">;
interface JobSummary {
  id: string;
  title: string;
}

export interface AdminReportListItem extends Report {
  reporter: ProfileSummary | null;
  reportedUser: ProfileSummary | null;
  reportedJob: JobSummary | null;
  hasEvidence: boolean;
}

export interface AdminReportEvidenceSummary {
  id: string;
  file_name: string;
  content_type: string;
  file_size: number | null;
  created_at: string;
}

export interface AdminReportDetail extends AdminReportListItem {
  relatedJob: JobSummary | null;
  reviewer: Pick<Profile, "id" | "full_name"> | null;
  moderationActions: (ModerationAction & { admin: Pick<Profile, "id" | "full_name"> | null })[];
  /** Metadata únicamente — nunca storage_path ni una URL. La lectura del archivo en sí va por getReportEvidenceSignedUrl() (report-evidence.ts), bajo demanda. */
  evidence: AdminReportEvidenceSummary[];
}

export interface ReportCounts {
  pending: number;
  under_review: number;
  resolved: number;
  dismissed: number;
}

export interface ReportListFilters {
  status?: ReportStatus | "all";
  targetType?: ReportTargetType | "all";
  reason?: ReportReason | "all";
  dateFrom?: string;
  dateTo?: string;
  /** UUID exacto (id de reporte/usuario/oferta) o nombre parcial de reportante/reportado. */
  search?: string;
}

type SupabaseSession = Awaited<ReturnType<typeof assertAdmin>>["supabase"];

/**
 * Enriquecimiento en memoria: colecta los IDs de perfiles/ofertas
 * referenciados por un lote de reportes y los resuelve con consultas
 * `.in()` simples — nunca con el `reported_user_id` u otros campos
 * enviados por un cliente (todos vienen de filas ya leídas de
 * `reports`, que a su vez solo se alcanza detrás de assertAdmin()).
 */
async function enrichReports(
  supabase: SupabaseSession,
  reports: Report[]
): Promise<AdminReportListItem[]> {
  if (reports.length === 0) return [];

  const userIds = Array.from(
    new Set(reports.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter((id): id is string => !!id))
  );
  const jobIds = Array.from(
    new Set(reports.flatMap((r) => [r.reported_job_id, r.related_job_id]).filter((id): id is string => !!id))
  );
  const reportIds = reports.map((r) => r.id);

  const [profilesRes, jobsRes, evidenceRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, avatar_url, city, role").in("id", userIds)
      : Promise.resolve({ data: [] as ProfileSummary[] }),
    jobIds.length
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as JobSummary[] }),
    supabase.from("report_evidence").select("report_id").in("report_id", reportIds),
  ]);

  const profileMap = new Map(((profilesRes.data as ProfileSummary[]) ?? []).map((p) => [p.id, p]));
  const jobMap = new Map(((jobsRes.data as JobSummary[]) ?? []).map((j) => [j.id, j]));
  const evidenceReportIds = new Set(
    ((evidenceRes.data as { report_id: string }[]) ?? []).map((e) => e.report_id)
  );

  return reports.map((r) => ({
    ...r,
    reporter: profileMap.get(r.reporter_id) ?? null,
    reportedUser: r.reported_user_id ? profileMap.get(r.reported_user_id) ?? null : null,
    reportedJob: r.reported_job_id ? jobMap.get(r.reported_job_id) ?? null : null,
    hasEvidence: evidenceReportIds.has(r.id),
  }));
}

/** Contadores para los StatCard del listado — mismo patrón que listVerificationDocuments() (admin.ts). */
export async function getReportCounts(): Promise<ReportCounts> {
  const { supabase } = await assertAdmin();

  const [{ count: pending }, { count: underReview }, { count: resolved }, { count: dismissed }] =
    await Promise.all([
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "under_review"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
    ]);

  return {
    pending: pending ?? 0,
    under_review: underReview ?? 0,
    resolved: resolved ?? 0,
    dismissed: dismissed ?? 0,
  };
}

/**
 * Bandeja de reportes con filtros y búsqueda. La búsqueda por nombre
 * resuelve primero los `profiles.id` que coinciden (consulta
 * parametrizada vía `.ilike()`, no interpolación de texto libre en
 * SQL) y luego filtra `reports` por esos IDs ya validados — el texto
 * del usuario nunca se concatena directamente en un filtro `.or()`.
 */
export async function listReports(filters: ReportListFilters = {}): Promise<AdminReportListItem[]> {
  const { supabase } = await assertAdmin();

  let query = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.targetType && filters.targetType !== "all") query = query.eq("target_type", filters.targetType);
  if (filters.reason && filters.reason !== "all") query = query.eq("reason", filters.reason);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

  const search = filters.search?.trim();
  if (search) {
    if (isValidUuid(search)) {
      query = query.or(
        `id.eq.${search},reporter_id.eq.${search},reported_user_id.eq.${search},reported_job_id.eq.${search}`
      );
    } else {
      const { data: matches } = await supabase
        .from("profiles")
        .select("id")
        .ilike("full_name", `%${search}%`)
        .limit(50);
      const ids = ((matches as { id: string }[]) ?? []).map((m) => m.id);
      if (ids.length === 0) return [];
      query = query.or(`reporter_id.in.(${ids.join(",")}),reported_user_id.in.(${ids.join(",")})`);
    }
  }

  const { data } = await query;
  return enrichReports(supabase, (data as unknown as Report[]) ?? []);
}

/**
 * Detalle completo de un reporte: datos del reporte + reportante +
 * reportado + oferta relacionada + indicador de evidencia (sin
 * exponer archivos, Fase 3 punto 15) + historial de moderation_actions
 * con el nombre del admin que la registró. Mismo patrón IDOR que
 * getAdminUserProfile()/getReportDetail() de Fase 1: valida formato de
 * UUID antes de consultar, autorización real vía assertAdmin().
 */
export async function getReportDetail(reportId: string): Promise<AdminReportDetail | null> {
  const { supabase } = await assertAdmin();
  if (!isValidUuid(reportId)) return null;

  const { data } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
  const report = data as unknown as Report | null;
  if (!report) return null;

  const [enriched] = await enrichReports(supabase, [report]);

  const [relatedJobRes, reviewerRes, actionsRes, evidenceRes] = await Promise.all([
    report.related_job_id
      ? supabase.from("jobs").select("id, title").eq("id", report.related_job_id).maybeSingle()
      : Promise.resolve({ data: null }),
    report.reviewed_by
      ? supabase.from("profiles").select("id, full_name").eq("id", report.reviewed_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("moderation_actions")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_evidence")
      .select("id, file_name, content_type, file_size, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true }),
  ]);

  const actions = (actionsRes.data as unknown as ModerationAction[]) ?? [];
  const adminIds = Array.from(new Set(actions.map((a) => a.admin_id)));
  const { data: adminsData } = adminIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", adminIds)
    : { data: [] as Pick<Profile, "id" | "full_name">[] };
  const adminMap = new Map(((adminsData as Pick<Profile, "id" | "full_name">[]) ?? []).map((a) => [a.id, a]));

  return {
    ...enriched,
    relatedJob: (relatedJobRes.data as JobSummary | null) ?? null,
    reviewer: (reviewerRes.data as Pick<Profile, "id" | "full_name"> | null) ?? null,
    moderationActions: actions.map((a) => ({ ...a, admin: adminMap.get(a.admin_id) ?? null })),
    evidence: (evidenceRes.data as unknown as AdminReportEvidenceSummary[]) ?? [],
  };
}

/**
 * Cambia el estado de un reporte, validando la transición en servidor
 * (nunca confía en lo que el cliente diga que es el estado actual) y
 * registra automáticamente una fila en moderation_actions
 * (action_type='status_changed'). El UPDATE incluye
 * `.eq("status", current.status)` como guarda atómica — si otro admin
 * cambió el estado entre la lectura y la escritura, esta llamada
 * afecta 0 filas en vez de pisar silenciosamente esa decisión (mismo
 * patrón que reviewVerificationDocument(), admin.ts).
 */
export async function updateReportStatus(
  reportId: string,
  newStatus: ReportStatus,
  adminNotes?: string
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, adminId } = await assertAdmin();

  if (!isValidUuid(reportId)) return { error: "Reporte inválido." };
  if (!VALID_REPORT_STATUSES.includes(newStatus)) return { error: "Estado inválido." };

  const { data: current } = await supabase
    .from("reports")
    .select("status, reported_user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!current) return { error: "Reporte no encontrado." };

  const { status: currentStatus, reported_user_id: targetUserId } = current as {
    status: ReportStatus;
    reported_user_id: string | null;
  };

  if (!REPORT_STATUS_TRANSITIONS[currentStatus].includes(newStatus)) {
    return { error: `No se puede pasar de "${currentStatus}" a "${newStatus}".` };
  }

  const { data, error } = await supabase
    .from("reports")
    .update({
      status: newStatus,
      admin_notes: adminNotes?.trim() || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", currentStatus)
    .select("id")
    .maybeSingle();

  if (error) {
    // trg_report_status_transition (0026, Fase 9) es la garantía real a
    // nivel de base de datos de que ninguna transición fuera de las 4
    // oficiales puede escribirse — REPORT_STATUS_TRANSITIONS (arriba)
    // ya debería haber rechazado esto antes de llegar aquí en el flujo
    // normal de la app; este catch es defensa en profundidad para
    // cualquier camino que no pase por esa validación, sin filtrar
    // detalles internos de Postgres al cliente.
    if (error.message?.includes("report_status_transition_invalid")) {
      return { error: "El estado del reporte ya no permite esa transición." };
    }
    return { error: "No se pudo actualizar el reporte." };
  }
  if (!data) {
    return { error: "El estado del reporte cambió mientras procesabas esta acción. Recarga e intenta de nuevo." };
  }

  await supabase.from("moderation_actions").insert({
    report_id: reportId,
    admin_id: adminId,
    target_user_id: targetUserId,
    action_type: "status_changed",
    metadata: { from: currentStatus, to: newStatus },
  });

  return { success: true };
}

const RECORDABLE_ACTION_TYPES: ModerationActionType[] = [
  "note_added",
  "warning_issued",
  "temporary_suspension",
  "permanent_block",
];

/**
 * Acciones con consecuencia real para el usuario objetivo — las únicas
 * que notify_moderation_action() (0023) notifica. Exigen un destinatario
 * real y no nulo: registrar una de estas sin nadie a quien atribuirla
 * sería una acción de moderación fantasma, sin efecto.
 */
const CONSEQUENTIAL_ACTION_TYPES: ModerationActionType[] = [
  "warning_issued",
  "temporary_suspension",
  "permanent_block",
];

/**
 * Resuelve a quién debe atribuirse una acción de moderación, en
 * servidor, según el tipo de objetivo del reporte — nunca desde un
 * valor enviado por el cliente (recordModerationAction() no acepta
 * ningún parámetro de destinatario en absoluto).
 *
 * target_type='user': reported_user_id directamente — siempre presente
 * (reports_target_matches_type, 0019, nunca relajado para este caso).
 *
 * target_type='job': un reporte de oferta no señala a ningún usuario en
 * `reports` (reported_user_id es siempre null para este caso, por el
 * mismo CHECK) — el destinatario real es el empleador dueño de la
 * oferta, resuelto aquí vía jobs.employer_id. Si reported_job_id es
 * null, la oferta ya fue eliminada (reports_survive_job_deletion, 0031
 * — el reporte y su evidencia sobreviven al borrado, pero no queda
 * ningún empleador al que atribuir una acción nueva) — se devuelve
 * `null` sin inventar ningún destinatario; recordModerationAction()
 * decide qué hacer con ese `null` según el tipo de acción (ver abajo).
 */
/**
 * Señal interna: la consulta a `jobs` de resolveModerationTargetUserId()
 * falló por una razón real (RLS, red, PostgREST) — nunca cruza el límite
 * público de recordModerationAction(), que la captura y la traduce a un
 * error seguro y genérico. Se distingue a propósito de "la oferta no
 * existe" (ese caso sigue devolviendo `null`, sin lanzar nada): antes,
 * ambos casos eran indistinguibles porque el `error` de la consulta se
 * descartaba, así que un fallo real de la consulta se reportaba al admin
 * como si la oferta hubiera sido eliminada.
 */
class ModerationJobLookupError extends Error {}

async function resolveModerationTargetUserId(
  supabase: SupabaseSession,
  targetType: ReportTargetType,
  reportedUserId: string | null,
  reportedJobId: string | null
): Promise<string | null> {
  if (targetType === "user") {
    return reportedUserId;
  }

  // target_type === "job"
  if (!reportedJobId) return null;

  const { data: job, error } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", reportedJobId)
    .maybeSingle();
  if (error) {
    throw new ModerationJobLookupError("No se pudo verificar la oferta reportada.");
  }
  return (job as { employer_id: string } | null)?.employer_id ?? null;
}

/**
 * Registra una acción de moderación — SOLO el registro de auditoría.
 * No suspende, no bloquea, no desactiva ninguna cuenta: esta fase
 * explícitamente no implementa el comportamiento real de esas
 * sanciones (requeriría un mecanismo de expiración que hoy no existe
 * para 'temporary_suspension', y reutilizar toggleUserActive() para
 * 'permanent_block' queda fuera de alcance hasta que se autorice esa
 * integración por separado). target_user_id siempre se deriva del
 * propio reporte en el servidor — nunca de un valor enviado por el
 * cliente — y admin_id siempre de assertAdmin() (auth.uid()).
 *
 * No cambia reports.status: registrar una acción de moderación (aunque
 * sea warning_issued/temporary_suspension/permanent_block) es
 * independiente de resolver el reporte — ambas son decisiones propias
 * del admin, sin acoplamiento automático (mismo diseño original, §11.5
 * de docs/user-reporting-moderation-design.md, que las lista como
 * acciones separadas). Si se necesitara ese acoplamiento en el futuro,
 * es una decisión de producto nueva, no un bug de esta función.
 */
export async function recordModerationAction(
  reportId: string,
  actionType: ModerationActionType,
  reason?: string
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, adminId } = await assertAdmin();

  if (!isValidUuid(reportId)) return { error: "Reporte inválido." };
  if (!RECORDABLE_ACTION_TYPES.includes(actionType)) return { error: "Tipo de acción inválido." };

  const { data: report } = await supabase
    .from("reports")
    .select("id, target_type, reported_user_id, reported_job_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "Reporte no encontrado." };

  const {
    target_type: targetType,
    reported_user_id: reportedUserId,
    reported_job_id: reportedJobId,
  } = report as {
    target_type: ReportTargetType;
    reported_user_id: string | null;
    reported_job_id: string | null;
  };

  let targetUserId: string | null;
  try {
    targetUserId = await resolveModerationTargetUserId(supabase, targetType, reportedUserId, reportedJobId);
  } catch (err) {
    if (err instanceof ModerationJobLookupError) {
      return { error: "No se pudo verificar la oferta reportada. Intenta nuevamente en unos minutos." };
    }
    throw err;
  }

  // Nunca se inserta una acción con consecuencia real sin un destinatario
  // resuelto — el único caso donde esto ocurre hoy es target_type='job'
  // con la oferta ya eliminada (reported_job_id=null tras 0031). No se
  // inventa ningún destinatario: se rechaza en servidor, antes de tocar
  // la base de datos, con un error explicable para el admin.
  if (targetUserId === null && CONSEQUENTIAL_ACTION_TYPES.includes(actionType)) {
    return {
      error:
        "No se pudo registrar la acción: la oferta reportada ya no existe, así que no hay ningún destinatario válido al que notificar.",
    };
  }

  const { error } = await supabase.from("moderation_actions").insert({
    report_id: reportId,
    admin_id: adminId,
    target_user_id: targetUserId,
    action_type: actionType,
    reason: reason?.trim() || null,
    metadata: {},
  });

  if (error) {
    // trg_moderation_action_target_coherence (0027, extendida en 0033
    // para target_type='job') es la garantía real a nivel de base de
    // datos de que target_user_id siempre coincide con el objetivo real
    // del reporte (reports.reported_user_id para 'user', jobs.employer_id
    // vía reports.reported_job_id para 'job') — targetUserId ya se
    // resuelve con la misma lógica arriba (resolveModerationTargetUserId),
    // así que este catch es defensa en profundidad, no debería alcanzarse
    // en el flujo normal de la app.
    if (error.message?.includes("moderation_action_target_mismatch")) {
      return { error: "No se pudo registrar la acción: el usuario objetivo no corresponde a este reporte." };
    }
    // moderation_actions_recordable_type (0029, Fase 12) es la garantía
    // real a nivel de base de datos de que action_type nunca es un
    // valor fuera de lo que RECORDABLE_ACTION_TYPES (arriba) ya
    // permite — inalcanzable en el flujo normal (ya se valida en la
    // línea de arriba), defensa en profundidad para PostgREST directo.
    if (error.message?.includes("moderation_actions_recordable_type")) {
      return { error: "Tipo de acción inválido." };
    }
    return { error: "No se pudo registrar la acción de moderación." };
  }
  return { success: true };
}
