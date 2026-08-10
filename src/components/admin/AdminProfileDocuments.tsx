import { FileText, ExternalLink, ShieldCheck, Clock, XCircle, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  documentTypeLabel,
  documentStatusLabel,
  documentStatusTone,
  rejectionReasonLabel,
} from "@/lib/document-verification";
import { formatDate } from "@/lib/utils";
import type { AdminUserProfileDetail } from "@/lib/actions/admin";

function statusIcon(status: string) {
  if (status === "verified") return <ShieldCheck className="h-4 w-4 text-success-500" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-danger-500" />;
  return <Clock className="h-4 w-4 text-warning-500" />;
}

/**
 * Documentos + historial de revisión. Las URLs ya vienen firmadas y
 * resueltas server-side (getAdminUserProfile, TTL 5 min) — este
 * componente solo las renderiza, nunca llama a storage directamente.
 * Sin tablas anchas (pedido explícito de responsive): tanto la lista de
 * documentos como el historial usan tarjetas apiladas, igual en mobile
 * que en desktop.
 */
export function AdminProfileDocuments({ data }: { data: AdminUserProfileDetail }) {
  const { documents, documentReviews } = data;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-ink">Documentos</h2>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos subidos"
          description="Este usuario todavía no subió documentos de verificación."
        />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {documents.map((doc) => {
            const isPdf = doc.file_name.toLowerCase().endsWith(".pdf");
            return (
              <div key={doc.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {documentTypeLabel(doc.document_type)}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{doc.file_name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Subido el {formatDate(doc.uploaded_at)}
                      {doc.reviewed_at && ` · Revisado el ${formatDate(doc.reviewed_at)}`}
                      {doc.reviewer && ` por ${doc.reviewer.full_name}`}
                    </p>
                  </div>
                  <Badge tone={documentStatusTone(doc.status)} className="shrink-0">
                    {statusIcon(doc.status)}
                    {documentStatusLabel(doc.status)}
                  </Badge>
                </div>

                {doc.status === "rejected" && doc.rejection_reason && (
                  <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-700">
                    <strong>Motivo:</strong> {rejectionReasonLabel(doc.rejection_reason)}
                    {doc.rejection_note ? ` — ${doc.rejection_note}` : ""}
                  </p>
                )}

                {doc.documentUrl ? (
                  <div className="mt-3">
                    {!isPdf && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doc.documentUrl}
                        alt={`${documentTypeLabel(doc.document_type)} de ${doc.file_name}`}
                        className="mb-2 max-h-64 w-full rounded-2xl border border-slate-100 object-contain"
                      />
                    )}
                    <a
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary gap-1.5 !rounded-xl !px-3 !py-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver documento
                    </a>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-muted">No se pudo generar la vista previa.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {documentReviews.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-ink">Historial de verificaciones</h3>
          <div className="space-y-3">
            {documentReviews.map((review) => (
              <div key={review.id} className="flex items-start gap-2 text-xs text-ink-muted">
                <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  <strong className="text-ink">
                    {review.document ? documentTypeLabel(review.document.document_type) : "Documento"}
                  </strong>
                  : {documentStatusLabel(review.previous_status)} → {documentStatusLabel(review.new_status)}
                  {review.rejection_reason && ` (${rejectionReasonLabel(review.rejection_reason)})`}
                  {" — "}
                  {review.reviewer?.full_name ?? "Admin"} el {formatDate(review.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
