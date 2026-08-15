"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, ExternalLink } from "lucide-react";
import { getReportEvidenceSignedUrl } from "@/lib/actions/report-evidence";
import { useToast } from "@/components/ui/Toaster";
import { formatDate } from "@/lib/utils";
import type { AdminReportEvidenceSummary } from "@/lib/actions/admin-reports";

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Ver" nunca abre una URL pública ni un path de Storage directo —
 * pide una signed URL de corta duración (300s) en el momento del
 * click, vía getReportEvidenceSignedUrl() (report-evidence.ts, la
 * misma función que usa el reportante para su propia evidencia). La
 * URL no se guarda en ningún estado más allá de abrir la pestaña.
 */
export function AdminEvidenceList({ evidence }: { evidence: AdminReportEvidenceSummary[] }) {
  const toast = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleView(evidenceId: string) {
    setLoadingId(evidenceId);
    try {
      const result = await getReportEvidenceSignedUrl(evidenceId);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingId(null);
    }
  }

  if (evidence.length === 0) {
    return (
      <div className="card p-5 text-center text-sm text-ink-muted">No hay evidencia adjunta.</div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Evidencia ({evidence.length})</h2>
      <div className="space-y-2">
        {evidence.map((e) => {
          const isImage = e.content_type.startsWith("image/");
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-xs"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                {isImage ? (
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{e.file_name}</p>
                <p className="text-ink-muted">
                  {e.content_type}
                  {e.file_size ? ` · ${formatFileSize(e.file_size)}` : ""} · {formatDate(e.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleView(e.id)}
                disabled={loadingId === e.id}
                className="btn-secondary shrink-0 !rounded-xl !px-3 !py-2 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {loadingId === e.id ? "Cargando…" : "Ver"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
