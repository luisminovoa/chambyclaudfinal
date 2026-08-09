import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMyReports } from "@/lib/actions/reports";
import { REPORT_REASON_LABELS, REPORT_TARGET_TYPE_LABELS } from "@/lib/report-config";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { formatDate } from "@/lib/utils";
import type { ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Mis reportes | Chamby" };

/**
 * No existía ningún lugar adecuado para esto en el dashboard actual
 * (worker/employer son paneles separados, y "Mis reportes" aplica a
 * ambos por igual) — ruta mínima nueva, gateada por sesión igual que
 * el resto de /dashboard/**, enlazada desde UserMenu.tsx.
 *
 * Usa getMyReports() (src/lib/actions/reports.ts), que a su vez lee
 * de reporter_reports_view — nunca la tabla `reports` directamente —
 * así que esta página estructuralmente no puede mostrar admin_notes,
 * reviewed_by ni ninguna acción interna de moderación: esas columnas
 * no existen en los datos que llegan aquí.
 */

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pendiente",
  under_review: "En revisión",
  resolved: "Resuelto",
  dismissed: "Descartado",
};

const STATUS_TONE: Record<ReportStatus, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  under_review: "info",
  resolved: "success",
  dismissed: "neutral",
};

export default async function MyReportsPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/reports");

  const reports = await getMyReports();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Mis reportes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Reportes que enviaste a nuestro equipo de moderación.
        </p>
      </Reveal>

      {reports.length === 0 ? (
        <Reveal delay={0.05} className="mt-6">
          <EmptyState
            pose="search"
            title="Todavía no enviaste ningún reporte"
            description="Cuando reportes a un usuario o una oferta, lo verás aquí con su estado."
          />
        </Reveal>
      ) : (
        <div className="mt-6 space-y-3">
          {reports.map((report, i) => (
            <Reveal key={report.id} delay={Math.min(i * 0.03, 0.3)}>
              <div className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">
                    {REPORT_TARGET_TYPE_LABELS[report.target_type]}
                  </span>
                  <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABELS[report.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {REPORT_REASON_LABELS[report.reason]} · {formatDate(report.created_at)}
                </p>
                <p className="mt-2 text-sm text-ink-muted">{report.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
