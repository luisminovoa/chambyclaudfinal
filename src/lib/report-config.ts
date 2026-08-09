import type { ReportReason, ReportStatus, ReportTargetType, UserRole } from "@/lib/types";

/**
 * Catálogo de motivos de reporte — única fuente de verdad para labels
 * y agrupación por contexto (usuario/oferta y, dentro de usuario, qué
 * motivos aplican reportando a un empleador vs. a un trabajador). Los
 * valores en sí son exactamente los del enum `report_reason` de
 * 0019_user_reports_moderation.sql — este módulo no inventa strings
 * nuevos, solo los etiqueta y los agrupa.
 *
 * Usado tanto por la UI (ReportModal) como por la validación del
 * Server Action (submitReport, src/lib/actions/reports.ts) — mismo
 * patrón que badge-config.ts/document-verification.ts: un solo lugar,
 * nunca duplicar el mapeo motivo→label en cada componente.
 */

export const ALL_REPORT_REASONS: ReportReason[] = [
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

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  scam_fraud: "Estafa, fraude u oferta falsa",
  inappropriate_behavior: "Comportamiento inapropiado",
  non_compliance: "Incumplimiento",
  harassment: "Acoso",
  suspicious_request: "Solicitud sospechosa",
  payment_issue: "Problema de pago",
  no_show: "No se presentó",
  false_information: "Información falsa",
  inappropriate_content: "Contenido inapropiado",
  suspicious_terms: "Condiciones sospechosas",
  discrimination: "Discriminación",
  spam: "Spam",
  other: "Otro",
};

/** Trabajador reporta a un empleador. */
export const REPORT_REASONS_USER_AS_EMPLOYER: ReportReason[] = [
  "scam_fraud",
  "inappropriate_behavior",
  "non_compliance",
  "harassment",
  "suspicious_request",
  "payment_issue",
  "other",
];

/** Empleador reporta a un trabajador. */
export const REPORT_REASONS_USER_AS_WORKER: ReportReason[] = [
  "no_show",
  "inappropriate_behavior",
  "false_information",
  "non_compliance",
  "scam_fraud",
  "harassment",
  "other",
];

/** Cualquier usuario reporta una oferta de trabajo. */
export const REPORT_REASONS_JOB: ReportReason[] = [
  "scam_fraud",
  "inappropriate_content",
  "suspicious_terms",
  "discrimination",
  "spam",
  "other",
];

export const REPORT_TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  user: "Reportar usuario",
  job: "Reportar oferta",
};

/** Mismo patrón que documentStatusLabel/documentStatusTone (document-verification.ts) — usado por /dashboard/reports y /admin/reports, un solo lugar. */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pendiente",
  under_review: "En revisión",
  resolved: "Resuelto",
  dismissed: "Descartado",
};

export function reportStatusTone(status: ReportStatus): "warning" | "info" | "success" | "neutral" {
  if (status === "pending") return "warning";
  if (status === "under_review") return "info";
  if (status === "resolved") return "success";
  return "neutral";
}

/**
 * Transiciones de estado permitidas para el panel admin (Fase 3) —
 * única fuente compartida entre la validación real del servidor
 * (admin-reports.ts, "use server", no puede exportar este const
 * directamente para un componente cliente) y la UI que solo debe
 * ofrecer botones para transiciones legítimas. Deliberadamente más
 * estricto que el diseño original (§4 de user-reporting-moderation-
 * design.md, que permitía pending→resolved directo y reabrir estados
 * terminales) — instrucción explícita de la Fase 3.
 */
export const REPORT_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  pending: ["under_review", "dismissed"],
  under_review: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

export interface ReportReasonOption {
  value: ReportReason;
  label: string;
}

/**
 * Motivos disponibles según el contexto. Para target_type='user', el
 * rol del usuario REPORTADO (no el del reportante) determina la
 * lista — reportar a un empleador y reportar a un trabajador son
 * situaciones distintas con motivos distintos (ver §5 del documento
 * de diseño). Si el rol del reportado no se conoce todavía (ej. un
 * componente genérico sin ese dato a mano), se usa la lista de
 * "reporta a un trabajador" como base razonable — de cualquier forma
 * es solo una ayuda de UI: la validación real de "¿es un valor
 * legítimo del enum?" ocurre en submitReport() contra
 * ALL_REPORT_REASONS, no contra este subconjunto.
 */
export function getReportReasonOptions(
  targetType: ReportTargetType,
  reportedUserRole?: UserRole
): ReportReasonOption[] {
  const reasons =
    targetType === "job"
      ? REPORT_REASONS_JOB
      : reportedUserRole === "employer"
        ? REPORT_REASONS_USER_AS_EMPLOYER
        : REPORT_REASONS_USER_AS_WORKER;

  return reasons.map((value) => ({ value, label: REPORT_REASON_LABELS[value] }));
}
