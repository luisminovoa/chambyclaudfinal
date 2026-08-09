"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { ReportTargetType, ReportReason, ReporterReportView } from "@/lib/types";

/**
 * Fase 1 (infraestructura): solo lo mínimo para validar que el modelo
 * de datos y RLS de 0019_user_reports_moderation.sql funcionan de
 * extremo a extremo. El flujo completo (botón/modal "Reportar",
 * catálogo de motivos por contexto en src/lib/report-config.ts,
 * evidencia) es Fase 4/6 — fuera de alcance aquí, ver
 * docs/user-reporting-moderation-design.md §19.
 */

const VALID_TARGET_TYPES: ReportTargetType[] = ["user", "job"];

const VALID_REASONS: ReportReason[] = [
  "scam_fraud",
  "inappropriate_behavior",
  "non_compliance",
  "harassment",
  "suspicious_request",
  "payment_issue",
  "no_show",
  "false_information",
  "inappropriate_content",
  "suspicious_terms",
  "discrimination",
  "spam",
  "other",
];

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
 * autorizar, solo para seleccionar qué fila crear.
 *
 * El auto-reporte se rechaza aquí también (no solo en el CHECK de
 * tabla) para devolver un mensaje de error claro en vez de un error
 * crudo de Postgres — el CHECK sigue siendo la garantía real, esto es
 * solo UX.
 */
export async function submitReport(input: SubmitReportInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión para reportar." };

  if (!VALID_TARGET_TYPES.includes(input.targetType)) {
    return { error: "Tipo de reporte inválido." };
  }
  if (!VALID_REASONS.includes(input.reason)) {
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
    if (input.reportedUserId === user.id) {
      return { error: "No puedes reportarte a ti mismo." };
    }
  }
  if (input.targetType === "job" && !input.reportedJobId) {
    return { error: "Falta la oferta reportada." };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: input.targetType,
    reported_user_id: input.targetType === "user" ? input.reportedUserId : null,
    reported_job_id: input.targetType === "job" ? input.reportedJobId : null,
    related_job_id: input.relatedJobId ?? null,
    reason: input.reason,
    description: input.description.trim(),
  });

  if (error) return { error: "No se pudo enviar el reporte. Intenta de nuevo." };
  return { success: true };
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
