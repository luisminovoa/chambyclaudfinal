"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ALL_REPORT_REASONS } from "@/lib/report-config";
import type { ActionResult } from "@/lib/actions/auth";
import type { ReportTargetType, ReportReason, ReporterReportView } from "@/lib/types";

/**
 * Fase 2: flujo funcional completo de creación/consulta de reportes.
 * El panel admin vive en admin-reports.ts, sin cambios aquí. La
 * evidencia (Fase 4) vive en report-evidence.ts — submitReport()
 * devuelve `reportId` únicamente para que el cliente sepa a qué fila
 * adjuntar los archivos después de crear el reporte, nada más.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TARGET_TYPES: ReportTargetType[] = ["user", "job"];

function isValidUuid(value: string): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

interface SubmitReportInput {
  targetType: ReportTargetType;
  reportedUserId?: string;
  reportedJobId?: string;
  relatedJobId?: string;
  reason: ReportReason;
  description: string;
}

/**
 * Crea un reporte. reporter_id nunca se toma del input — siempre
 * auth.uid() del lado servidor, así que no hay forma de que un cliente
 * envíe reporter_id ajeno (protección IDOR/spoofing de identidad,
 * doblemente forzada porque reports_insert_own en RLS exige lo mismo).
 * reported_user_id/reported_job_id sí vienen del cliente — es la
 * esencia del feature ("a quién reporto") — pero nunca se usan para
 * autorizar, solo para seleccionar qué fila crear, y siempre se
 * verifica que el objetivo exista antes de insertar (RLS por sí sola
 * no lo garantiza: un `reported_user_id`/`reported_job_id` inexistente
 * pasaría el CHECK igual, RLS no valida claves foráneas contra datos
 * reales más allá de la restricción de FK en sí, que en este esquema
 * son nullable y no bloquean el INSERT por un UUID bien formado pero
 * inexistente hasta que Postgres lo intenta resolver — se prefiere
 * fallar temprano con un mensaje claro en vez de un error crudo de FK).
 *
 * El auto-reporte, la coherencia target_type/target y la duplicación
 * también se validan aquí — no solo se confía en RLS/CHECK/índice
 * único: esos son la garantía real (no se pueden saltar aunque esta
 * función tuviera un bug), esto es además una respuesta de error
 * legible en vez de un error crudo de Postgres.
 */
export async function submitReport(input: SubmitReportInput): Promise<ActionResult & { reportId?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión para reportar." };

  if (!VALID_TARGET_TYPES.includes(input.targetType)) {
    return { error: "Tipo de reporte inválido." };
  }
  if (!ALL_REPORT_REASONS.includes(input.reason)) {
    return { error: "Motivo inválido." };
  }
  if (!input.description.trim()) {
    return { error: "La descripción no puede estar vacía." };
  }
  if (input.description.length > 2000) {
    return { error: "Descripción demasiado larga." };
  }

  if (input.targetType === "user") {
    if (!input.reportedUserId) return { error: "Falta el usuario reportado." };
    if (!isValidUuid(input.reportedUserId)) return { error: "Identificador de usuario inválido." };
    if (input.reportedJobId) return { error: "Datos de reporte inconsistentes." };
    if (input.reportedUserId === user.id) return { error: "No puedes reportarte a ti mismo." };

    // El usuario reportado es un tercero cualquiera (auth.uid() puede
    // reportar a alguien con quien no tiene ninguna relación previa
    // verificada): la RLS de profiles (0034_harden_profiles_public_access.sql)
    // ya no deja resolver su existencia con el cliente de sesión. Es una
    // simple comprobación de existencia — solo "id", nunca ninguna
    // columna de PII — así que se resuelve con el cliente admin.
    const { data: targetProfile } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("id", input.reportedUserId)
      .maybeSingle();
    if (!targetProfile) return { error: "El usuario reportado no existe." };
  }

  if (input.targetType === "job") {
    if (!input.reportedJobId) return { error: "Falta la oferta reportada." };
    if (!isValidUuid(input.reportedJobId)) return { error: "Identificador de oferta inválido." };
    if (input.reportedUserId) return { error: "Datos de reporte inconsistentes." };

    const { data: targetJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", input.reportedJobId)
      .maybeSingle();
    if (!targetJob) return { error: "La oferta reportada no existe." };
  }

  if (input.relatedJobId) {
    if (!isValidUuid(input.relatedJobId)) return { error: "Identificador de trabajo relacionado inválido." };

    const { data: relatedJob } = await supabase
      .from("jobs")
      .select("id, employer_id, assigned_worker_id")
      .eq("id", input.relatedJobId)
      .maybeSingle();
    if (!relatedJob) return { error: "El trabajo relacionado no existe." };

    const job = relatedJob as { employer_id: string; assigned_worker_id: string | null };
    const involvesReporter = job.employer_id === user.id || job.assigned_worker_id === user.id;
    const involvesReported =
      input.targetType === "user" &&
      (job.employer_id === input.reportedUserId || job.assigned_worker_id === input.reportedUserId);
    if (!involvesReporter && !involvesReported) {
      return { error: "El trabajo relacionado no corresponde a este reporte." };
    }
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: user.id,
      target_type: input.targetType,
      reported_user_id: input.targetType === "user" ? input.reportedUserId : null,
      reported_job_id: input.targetType === "job" ? input.reportedJobId : null,
      related_job_id: input.relatedJobId ?? null,
      reason: input.reason,
      description: input.description.trim(),
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation: reports_no_duplicate_active (0019, target
    // 'user') o reports_no_duplicate_active_job (0025, target 'job') ya
    // tiene un reporte activo (pending/under_review) de este mismo
    // reportante contra el mismo objetivo y motivo. No es un error del
    // sistema — es información útil para el usuario, sin crear un
    // segundo mecanismo de deduplicación en la Server Action.
    if (error.code === "23505") {
      const target = input.targetType === "job" ? "esta oferta" : "este usuario";
      return {
        error: `Ya tienes un reporte activo sobre ${target} por este motivo. Nuestro equipo ya lo está revisando.`,
      };
    }
    return { error: "No se pudo enviar el reporte. Intenta de nuevo." };
  }
  // reportId se usa en el cliente (ReportModal, Fase 4) para adjuntar
  // evidencia justo después de crear el reporte — nunca se usa para
  // autorizar nada, solo para saber a qué fila subir los archivos.
  return { success: true, reportId: (data as { id: string }).id };
}

/**
 * Reportes del propio usuario — siempre vía reporter_reports_view
 * (0019), nunca la tabla `reports` directamente. La vista no expone
 * admin_notes/reviewed_by/reviewed_at: ver el comentario en la
 * migración y en ReporterReportView (src/lib/types.ts) para por qué
 * esa distancia es necesaria (RLS no puede ocultar columnas dentro de
 * una fila que su dueño ya puede leer).
 */
export async function getMyReports(): Promise<ReporterReportView[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("reporter_reports_view")
    .select("*")
    .order("created_at", { ascending: false });

  return (data as unknown as ReporterReportView[]) ?? [];
}
