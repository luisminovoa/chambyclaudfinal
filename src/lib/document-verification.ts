import type { DocumentType, DocumentStatus, DocumentRejectionReason } from "@/lib/types";

/**
 * Labels compartidos entre la vista del trabajador (DocumentsTab) y el
 * panel de verificación de admin — antes vivían solo dentro de
 * DocumentsTab.tsx como consts locales no exportadas; se extraen aquí
 * para no duplicar el mapeo en dos lugares.
 */
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "dni", label: "DNI" },
  { value: "ruc", label: "RUC" },
  { value: "antecedentes_policiales", label: "Antecedentes Policiales" },
  { value: "antecedentes_penales", label: "Antecedentes Penales" },
  { value: "certificado", label: "Certificado Profesional" },
  { value: "licencia", label: "Licencia" },
  { value: "carnet", label: "Carnet" },
  { value: "otro", label: "Otro documento" },
];

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPES.find((d) => d.value === type)?.label ?? type;
}

const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "En revisión",
  verified: "Verificado",
  rejected: "Rechazado",
};

export function documentStatusLabel(status: string): string {
  return STATUS_LABELS[status as DocumentStatus] ?? status;
}

export function documentStatusTone(status: string): "success" | "danger" | "warning" {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export const REJECTION_REASONS: { value: DocumentRejectionReason; label: string }[] = [
  { value: "illegible", label: "Documento ilegible" },
  { value: "expired", label: "Documento vencido" },
  { value: "data_mismatch", label: "Datos no coinciden" },
  { value: "wrong_document", label: "Documento incorrecto" },
  { value: "other", label: "Otro" },
];

export function rejectionReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return REJECTION_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
