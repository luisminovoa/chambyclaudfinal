import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, CalendarDays, User } from "lucide-react";
import { getVerificationDocumentDetail } from "@/lib/actions/admin";
import { VerificationReviewForm } from "@/components/admin/VerificationReviewForm";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import {
  documentTypeLabel,
  documentStatusLabel,
  documentStatusTone,
  rejectionReasonLabel,
} from "@/lib/document-verification";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Revisar documento | Admin Chamby" };

interface Props {
  params: { id: string };
}

export default async function AdminVerificationDetailPage({ params }: Props) {
  const doc = await getVerificationDocumentDetail(params.id);
  if (!doc) notFound();

  const isPdf = doc.file_name.toLowerCase().endsWith(".pdf");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/admin/verifications"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a verificaciones
        </Link>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <Avatar name={doc.profile?.full_name ?? "?"} src={doc.profile?.avatar_url} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">
                {doc.profile?.full_name ?? "Usuario eliminado"}
              </p>
              <p className="truncate text-xs text-ink-muted">{doc.profile?.city ?? "Sin ciudad"}</p>
            </div>
            <Badge tone={documentStatusTone(doc.status)} className="shrink-0">
              {documentStatusLabel(doc.status)}
            </Badge>
          </div>

          {/* profile_id es el mismo id de profiles que usa /admin/users/[id]
              (getAdminUserProfile) — mismo perfil que "Usuarios → Ver perfil". */}
          <Link
            href={`/admin/users/${doc.profile_id}`}
            className="btn-secondary mt-4 w-full justify-center !rounded-xl text-xs"
          >
            Ver perfil completo
          </Link>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <FileText className="h-3.5 w-3.5" />
                Tipo de documento
              </p>
              <p className="mt-1.5 text-sm font-bold text-ink">
                {documentTypeLabel(doc.document_type)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <CalendarDays className="h-3.5 w-3.5" />
                Fecha de subida
              </p>
              <p className="mt-1.5 text-sm font-bold text-ink">{formatDate(doc.uploaded_at)}</p>
            </div>
          </div>

          {/* Vista previa — URL firmada de corta duración (5 min), generada
              server-side solo después de confirmar rol admin. Nunca una URL
              pública permanente. */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Vista previa
            </p>
            {doc.documentUrl ? (
              isPdf ? (
                <a
                  href={doc.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full justify-center"
                >
                  Abrir PDF en una nueva pestaña
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.documentUrl}
                  alt={`Documento de ${doc.profile?.full_name ?? "trabajador"}`}
                  className="max-h-[420px] w-full rounded-2xl border border-slate-100 object-contain"
                />
              )
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-ink-muted">
                No se pudo generar la vista previa del documento.
              </p>
            )}
          </div>

          {doc.status === "rejected" && doc.rejection_reason && (
            <div className="mt-5 rounded-2xl bg-danger-50 p-4 text-sm text-danger-700">
              <p className="font-semibold">
                Rechazado — {rejectionReasonLabel(doc.rejection_reason)}
              </p>
              {doc.rejection_note && <p className="mt-1 text-xs">{doc.rejection_note}</p>}
            </div>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        {doc.status === "pending" ? (
          <VerificationReviewForm documentId={doc.id} />
        ) : (
          <div className="card p-5 text-center text-sm text-ink-muted">
            Este documento ya fue revisado
            {doc.reviews[0] ? ` el ${formatDate(doc.reviews[0].created_at)}` : ""}.
          </div>
        )}
      </Reveal>

      {doc.reviews.length > 0 && (
        <Reveal delay={0.15} className="mt-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Historial de revisión</h2>
            <div className="space-y-3">
              {doc.reviews.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs text-ink-muted">
                  <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    <strong className="text-ink">{r.reviewer?.full_name ?? "Admin"}</strong> cambió
                    el estado de <strong>{documentStatusLabel(r.previous_status)}</strong> a{" "}
                    <strong>{documentStatusLabel(r.new_status)}</strong> el {formatDate(r.created_at)}
                    .
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}
