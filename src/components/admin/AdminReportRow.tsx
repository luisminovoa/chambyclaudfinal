import Link from "next/link";
import { ChevronRight, User, Briefcase } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, reportStatusTone } from "@/lib/report-config";
import { formatDate } from "@/lib/utils";
import type { AdminReportListItem } from "@/lib/actions/admin-reports";

export function AdminReportRow({ report }: { report: AdminReportListItem }) {
  const target =
    report.target_type === "user"
      ? (report.reportedUser?.full_name ?? "Usuario eliminado")
      : (report.reportedJob?.title ?? "Oferta eliminada");

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3.5 pr-4">
        <p className="font-mono text-xs font-semibold text-ink">{report.id.slice(0, 8)}</p>
        <p className="text-xs text-ink-muted">{formatDate(report.created_at)}</p>
      </td>
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-2">
          <Avatar name={report.reporter?.full_name ?? "?"} src={report.reporter?.avatar_url} size="sm" />
          <p className="max-w-[9rem] truncate text-sm font-medium text-ink">
            {report.reporter?.full_name ?? "Usuario eliminado"}
          </p>
        </div>
      </td>
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-1.5">
          {report.target_type === "user" ? (
            <User className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          ) : (
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          )}
          <p className="max-w-[9rem] truncate text-sm text-ink">{target}</p>
        </div>
      </td>
      <td className="py-3.5 pr-4 text-sm text-ink-muted">{REPORT_REASON_LABELS[report.reason]}</td>
      <td className="py-3.5 pr-4">
        <Badge tone={reportStatusTone(report.status)}>{REPORT_STATUS_LABELS[report.status]}</Badge>
      </td>
      <td className="py-3.5 pr-4 text-xs text-ink-muted">{formatDate(report.updated_at)}</td>
      <td className="py-3.5 text-right">
        <Link
          href={`/admin/reports/${report.id}`}
          className="btn-secondary !rounded-xl !px-3 !py-2 text-xs"
        >
          Ver detalle
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}
