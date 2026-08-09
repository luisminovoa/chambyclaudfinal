"use server";

import { assertAdmin } from "@/lib/actions/assert-admin";
import type { Report, ReportStatus } from "@/lib/types";

/**
 * Fase 1 (infraestructura): lo mínimo del lado admin para validar RLS
 * y el modelo de datos de 0019/0020. El panel /admin/reports
 * (filtros, búsqueda, vista de detalle con evidencia/historial) es
 * Fase 5 — fuera de alcance aquí, ver
 * docs/user-reporting-moderation-design.md §19.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_REPORT_STATUSES: ReportStatus[] = ["pending", "under_review", "resolved", "dismissed"];

/** Bandeja de reportes. assertAdmin() es la única puerta — sin esto, ningún cliente puede leer `reports` de otros usuarios (RLS lo respalda). */
export async function listReports(filter: ReportStatus | "all" = "pending"): Promise<Report[]> {
  const { supabase } = await assertAdmin();

  let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
  if (filter !== "all") query = query.eq("status", filter);

  const { data } = await query;
  return (data as unknown as Report[]) ?? [];
}

/**
 * Detalle de un reporte. Mismo patrón IDOR que getAdminUserProfile()
 * (admin.ts): valida formato de UUID antes de consultar, y depende de
 * assertAdmin() — no de que la UI oculte el link — para la
 * autorización real.
 */
export async function getReportDetail(reportId: string): Promise<Report | null> {
  const { supabase } = await assertAdmin();
  if (typeof reportId !== "string" || !UUID_RE.test(reportId)) return null;

  const { data } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
  return (data as unknown as Report) ?? null;
}

/**
 * Cambia el estado de un reporte y registra la acción en
 * moderation_actions en la misma llamada — no depende de un trigger
 * (los triggers de notificación quedan para la Fase 7, ver 0020). Solo
 * un admin puede llegar aquí (assertAdmin()); RLS respalda ambas
 * escrituras de todas formas (reports_update_admin,
 * moderation_actions_insert_admin) como segunda capa.
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  adminNotes?: string
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, adminId } = await assertAdmin();

  if (typeof reportId !== "string" || !UUID_RE.test(reportId)) return { error: "Reporte inválido." };
  if (!VALID_REPORT_STATUSES.includes(status)) return { error: "Estado inválido." };

  const { data, error } = await supabase
    .from("reports")
    .update({
      status,
      admin_notes: adminNotes?.trim() || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("reported_user_id")
    .maybeSingle();

  if (error) return { error: "No se pudo actualizar el reporte." };
  if (!data) return { error: "Reporte no encontrado." };

  const { reported_user_id: targetUserId } = data as { reported_user_id: string | null };

  await supabase.from("moderation_actions").insert({
    report_id: reportId,
    admin_id: adminId,
    target_user_id: targetUserId,
    action_type: "status_changed",
    metadata: { to: status },
  });

  return { success: true };
}
