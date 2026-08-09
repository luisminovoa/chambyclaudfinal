import type { Metadata } from "next";
import Link from "next/link";
import { Flag, Clock, Eye, CheckCircle2, XCircle } from "lucide-react";
import { listReports, getReportCounts } from "@/lib/actions/admin-reports";
import { AdminReportRow } from "@/components/admin/AdminReportRow";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ALL_REPORT_REASONS, REPORT_REASON_LABELS } from "@/lib/report-config";
import { cn } from "@/lib/utils";
import type { ReportStatus, ReportTargetType, ReportReason } from "@/lib/types";

export const metadata: Metadata = { title: "Reportes | Admin Chamby" };

type FilterStatus = "all" | ReportStatus;

interface SearchParams {
  status?: string;
  targetType?: string;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

const STATUS_TABS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "under_review", label: "En revisión" },
  { value: "resolved", label: "Resueltos" },
  { value: "dismissed", label: "Descartados" },
];

function statusTabHref(params: SearchParams, status: FilterStatus): string {
  const usp = new URLSearchParams();
  if (status !== "all") usp.set("status", status);
  if (params.targetType && params.targetType !== "all") usp.set("targetType", params.targetType);
  if (params.reason && params.reason !== "all") usp.set("reason", params.reason);
  if (params.dateFrom) usp.set("dateFrom", params.dateFrom);
  if (params.dateTo) usp.set("dateTo", params.dateTo);
  if (params.q) usp.set("q", params.q);
  const qs = usp.toString();
  return qs ? `/admin/reports?${qs}` : "/admin/reports";
}

export default async function AdminReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const status = (STATUS_TABS.some((t) => t.value === searchParams.status)
    ? searchParams.status
    : "all") as FilterStatus;
  const targetType = (["user", "job"].includes(searchParams.targetType ?? "")
    ? searchParams.targetType
    : "all") as ReportTargetType | "all";
  const reason = (ALL_REPORT_REASONS.includes(searchParams.reason as ReportReason)
    ? searchParams.reason
    : "all") as ReportReason | "all";

  const [reports, counts] = await Promise.all([
    listReports({
      status,
      targetType,
      reason,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      search: searchParams.q,
    }),
    getReportCounts(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Reportes</h1>
        <p className="mt-1 text-ink-muted">
          Reportes de usuarios y ofertas enviados por la comunidad.
        </p>
      </Reveal>

      {/* Contadores */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Reveal>
          <StatCard icon={Clock} label="Pendientes" value={counts.pending} tone="warning" />
        </Reveal>
        <Reveal delay={0.05}>
          <StatCard icon={Eye} label="En revisión" value={counts.under_review} tone="primary" />
        </Reveal>
        <Reveal delay={0.1}>
          <StatCard icon={CheckCircle2} label="Resueltos" value={counts.resolved} tone="success" />
        </Reveal>
        <Reveal delay={0.15}>
          <StatCard icon={XCircle} label="Descartados" value={counts.dismissed} tone="neutral" />
        </Reveal>
      </div>

      {/* Tabs de estado */}
      <Reveal delay={0.1}>
        <div className="mt-8 flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              href={statusTabHref(searchParams, t.value)}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                status === t.value
                  ? "bg-primary-50 text-primary-700"
                  : "text-ink-muted hover:bg-slate-50 hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Reveal>

      {/* Filtros adicionales + búsqueda */}
      <Reveal delay={0.15}>
        <form className="card mt-4 grid gap-3 p-4 sm:grid-cols-5" method="get">
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
          <select name="targetType" defaultValue={targetType} className="input text-sm">
            <option value="all">Todo tipo</option>
            <option value="user">Usuario</option>
            <option value="job">Oferta</option>
          </select>
          <select name="reason" defaultValue={reason} className="input text-sm">
            <option value="all">Todo motivo</option>
            {ALL_REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dateFrom"
            defaultValue={searchParams.dateFrom ?? ""}
            className="input text-sm"
            aria-label="Desde"
          />
          <input
            type="date"
            name="dateTo"
            defaultValue={searchParams.dateTo ?? ""}
            className="input text-sm"
            aria-label="Hasta"
          />
          <div className="flex gap-2 sm:col-span-1">
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="UUID o nombre..."
              className="input flex-1 text-sm"
            />
            <button type="submit" className="btn-secondary !px-3 !py-2 text-xs">
              Buscar
            </button>
          </div>
        </form>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="card mt-4 overflow-x-auto p-6">
          {reports.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="No hay reportes aquí"
              description="Cuando un usuario reporte a otro usuario o a una oferta, aparecerá en esta bandeja."
            />
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3 font-semibold">Reporte</th>
                  <th className="pb-3 font-semibold">Reportante</th>
                  <th className="pb-3 font-semibold">Objetivo</th>
                  <th className="pb-3 font-semibold">Motivo</th>
                  <th className="pb-3 font-semibold">Estado</th>
                  <th className="pb-3 font-semibold">Actualizado</th>
                  <th className="pb-3 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <AdminReportRow key={report.id} report={report} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Reveal>
    </div>
  );
}
