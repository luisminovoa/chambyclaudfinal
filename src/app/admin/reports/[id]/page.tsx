import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flag, User, Briefcase, CalendarDays } from "lucide-react";
import { getReportDetail } from "@/lib/actions/admin-reports";
import { AdminReportStatusForm } from "@/components/admin/AdminReportStatusForm";
import { AdminModerationActionForm } from "@/components/admin/AdminModerationActionForm";
import { AdminModerationHistory } from "@/components/admin/AdminModerationHistory";
import { AdminEvidenceList } from "@/components/admin/AdminEvidenceList";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import {
  REPORT_REASON_LABELS,
  REPORT_TARGET_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  reportStatusTone,
} from "@/lib/report-config";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Detalle de reporte | Admin Chamby" };

interface Props {
  params: { id: string };
}

/**
 * Protegida por las mismas 3 capas que /admin/users/[id] y
 * /admin/verifications/[id]: middleware.ts (sesión), admin/layout.tsx
 * (rol admin), y assertAdmin() dentro de getReportDetail() — la
 * autorización real no depende de que este enlace esté oculto en la
 * UI. Solo visible para administradores: nunca se expone al
 * reportante ni al usuario reportado por ningún otro camino de la app.
 */
export default async function AdminReportDetailPage({ params }: Props) {
  const report = await getReportDetail(params.id);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/admin/reports"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a reportes
        </Link>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="card p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-danger-600" />
              <h1 className="text-sm font-bold text-ink">{REPORT_TARGET_TYPE_LABELS[report.target_type]}</h1>
            </div>
            <Badge tone={reportStatusTone(report.status)}>{REPORT_STATUS_LABELS[report.status]}</Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <CalendarDays className="h-3.5 w-3.5" />
                Fecha del reporte
              </p>
              <p className="mt-1.5 text-sm font-bold text-ink">{formatDate(report.created_at)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Motivo</p>
              <p className="mt-1.5 text-sm font-bold text-ink">{REPORT_REASON_LABELS[report.reason]}</p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Descripción</p>
            <p className="mt-1.5 whitespace-pre-line text-sm text-ink">{report.description}</p>
          </div>

          {report.relatedJob && (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Briefcase className="h-3.5 w-3.5" />
                Trabajo relacionado
              </p>
              <Link
                href={`/jobs/${report.relatedJob.id}`}
                className="mt-1.5 block text-sm font-bold text-ink hover:text-primary-600"
              >
                {report.relatedJob.title}
              </Link>
            </div>
          )}
        </div>
      </Reveal>

      {/* Reportante y objetivo — solo visibles aquí, panel admin, nunca al denunciado */}
      <Reveal delay={0.1} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Reportante</p>
          {report.reporter ? (
            <div className="flex items-center gap-3">
              <Avatar name={report.reporter.full_name} src={report.reporter.avatar_url} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{report.reporter.full_name}</p>
                <p className="truncate text-xs text-ink-muted">{report.reporter.city ?? "Sin ciudad"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Usuario eliminado</p>
          )}
          {report.reporter && (
            <Link
              href={`/admin/users/${report.reporter.id}`}
              className="btn-secondary mt-4 w-full justify-center !rounded-xl text-xs"
            >
              Ver perfil completo
            </Link>
          )}
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {report.target_type === "user" ? "Usuario reportado" : "Oferta reportada"}
          </p>
          {report.target_type === "user" ? (
            report.reportedUser ? (
              <div className="flex items-center gap-3">
                <Avatar name={report.reportedUser.full_name} src={report.reportedUser.avatar_url} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{report.reportedUser.full_name}</p>
                  <p className="truncate text-xs text-ink-muted">{report.reportedUser.city ?? "Sin ciudad"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Usuario eliminado</p>
            )
          ) : report.reportedJob ? (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0 text-ink-muted" />
              <p className="truncate text-sm font-bold text-ink">{report.reportedJob.title}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Oferta eliminada</p>
          )}
          {report.target_type === "user" && report.reportedUser && (
            <Link
              href={`/admin/users/${report.reportedUser.id}`}
              className="btn-secondary mt-4 w-full justify-center !rounded-xl text-xs"
            >
              Ver perfil completo
            </Link>
          )}
          {report.target_type === "job" && report.reportedJob && (
            <Link
              href={`/jobs/${report.reportedJob.id}`}
              className="btn-secondary mt-4 w-full justify-center !rounded-xl text-xs"
            >
              Ver oferta
            </Link>
          )}
        </div>
      </Reveal>

      {report.reviewer && (
        <Reveal delay={0.12} className="mt-6">
          <div className="card flex items-center gap-2 p-4 text-xs text-ink-muted">
            <User className="h-3.5 w-3.5" />
            Última revisión por <strong className="text-ink">{report.reviewer.full_name}</strong> el{" "}
            {report.reviewed_at ? formatDate(report.reviewed_at) : "—"}
            {report.admin_notes && (
              <span className="block w-full">
                <span className="mt-1 block text-ink">Nota: {report.admin_notes}</span>
              </span>
            )}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.13} className="mt-6">
        <AdminEvidenceList evidence={report.evidence} />
      </Reveal>

      <Reveal delay={0.15} className="mt-6">
        <AdminReportStatusForm reportId={report.id} currentStatus={report.status} />
      </Reveal>

      <Reveal delay={0.2} className="mt-6">
        <AdminModerationActionForm reportId={report.id} />
      </Reveal>

      <Reveal delay={0.25} className="mt-6">
        <AdminModerationHistory actions={report.moderationActions} />
      </Reveal>
    </div>
  );
}
