import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { documentTypeLabel, documentStatusLabel, documentStatusTone } from "@/lib/document-verification";
import { formatDate } from "@/lib/utils";
import type { AdminVerificationDocument } from "@/lib/actions/admin";

export function AdminVerificationRow({ document }: { document: AdminVerificationDocument }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={document.profile?.full_name ?? "?"}
            src={document.profile?.avatar_url}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">
              {document.profile?.full_name ?? "Usuario eliminado"}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {document.profile?.city ?? "Sin ciudad"}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3.5 pr-4 text-sm text-ink">{documentTypeLabel(document.document_type)}</td>
      <td className="py-3.5 pr-4 text-xs text-ink-muted">{formatDate(document.uploaded_at)}</td>
      <td className="py-3.5 pr-4">
        <Badge tone={documentStatusTone(document.status)}>{documentStatusLabel(document.status)}</Badge>
      </td>
      <td className="py-3.5 text-right">
        <Link
          href={`/admin/verifications/${document.id}`}
          className="btn-secondary !rounded-xl !px-3 !py-2 text-xs"
        >
          Revisar
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}
