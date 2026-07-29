"use client";

import { useState, useTransition, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Clock,
  XCircle,
  FilePlus,
} from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  createDocumentUploadUrl,
  saveVerificationDocument,
  deleteVerificationDocument,
  getDocumentDownloadUrl,
  computeAndSaveProfileStats,
} from "@/lib/actions/profile";
import type { VerificationDocument, DocumentType } from "@/lib/types";

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "dni", label: "DNI" },
  { value: "ruc", label: "RUC" },
  { value: "antecedentes_policiales", label: "Antecedentes Policiales" },
  { value: "antecedentes_penales", label: "Antecedentes Penales" },
  { value: "certificado", label: "Certificado Profesional" },
  { value: "licencia", label: "Licencia" },
  { value: "carnet", label: "Carnet" },
  { value: "otro", label: "Otro documento" },
];

function statusIcon(status: string) {
  if (status === "verified")
    return <ShieldCheck className="h-4 w-4 text-success-500" />;
  if (status === "rejected")
    return <XCircle className="h-4 w-4 text-danger-500" />;
  return <Clock className="h-4 w-4 text-warning-500" />;
}

function statusTone(
  status: string
): "success" | "danger" | "warning" {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "En revisión",
    verified: "Verificado",
    rejected: "Rechazado",
  };
  return map[status] ?? status;
}

function typeLabel(type: string) {
  return DOCUMENT_TYPES.find((d) => d.value === type)?.label ?? type;
}

function uploadWithProgress(
  url: string,
  blob: Blob | File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(blob);
  });
}

interface DocumentsTabProps {
  initialDocuments: VerificationDocument[];
  onStatsChange: () => void;
}

export function DocumentsTab({ initialDocuments, onStatsChange }: DocumentsTabProps) {
  const [docs, setDocs] = useState<VerificationDocument[]>(initialDocuments);
  const [selectedType, setSelectedType] = useState<DocumentType>("dni");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingDownload, setLoadingDownload] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!ALLOWED.includes(file.type)) {
      toast("Solo se permiten imágenes JPG, PNG, WebP o PDF", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("El archivo no puede superar 10 MB", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const urlRes = await createDocumentUploadUrl(file.name, file.type);
      if ("error" in urlRes) {
        toast(urlRes.error, "error");
        return;
      }

      await uploadWithProgress(
        urlRes.uploadUrl!,
        file,
        file.type,
        setUploadProgress
      );

      const saveRes = await saveVerificationDocument({
        storagePath: urlRes.storagePath!,
        documentType: selectedType,
        fileName: file.name,
      });

      if ("error" in saveRes) {
        toast(saveRes.error, "error");
        return;
      }

      setDocs((prev) => [saveRes.document!, ...prev]);
      toast("Documento subido. Será revisado en breve.", "success");
      computeAndSaveProfileStats().then(onStatsChange);
    } catch {
      toast("Error al subir el documento. Inténtalo de nuevo.", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDelete(docId: string) {
    startTransition(async () => {
      const res = await deleteVerificationDocument(docId);
      if ("error" in res) {
        toast(res.error, "error");
      } else {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
        setConfirmDeleteId(null);
        toast("Documento eliminado", "success");
        computeAndSaveProfileStats().then(onStatsChange);
      }
    });
  }

  async function handleDownload(docId: string) {
    setLoadingDownload(docId);
    try {
      const url = await getDocumentDownloadUrl(docId);
      if (!url) {
        toast("No se pudo generar el enlace de descarga", "error");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingDownload(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Upload panel */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">Subir nuevo documento</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="doc-type" className="label">
              Tipo de documento
            </label>
            <select
              id="doc-type"
              className="input w-full"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-primary w-full sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {uploading ? `${uploadProgress}%` : "Seleccionar archivo"}
            </button>
          </div>
        </div>

        {uploading && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-primary-100">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          Formatos aceptados: JPG, PNG, WebP, PDF · Tamaño máximo: 10 MB
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
            <FilePlus className="h-7 w-7 text-primary-400" />
          </div>
          <div>
            <p className="font-bold text-ink">Sin documentos subidos</p>
            <p className="mt-1 text-sm text-ink-muted">
              Sube tu DNI, certificados y licencias para aumentar tu perfil de confianza
            </p>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                <FileText className="h-5 w-5 text-slate-400" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {typeLabel(doc.document_type)}
                </p>
                <p className="truncate text-xs text-ink-muted">{doc.file_name}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={statusTone(doc.status)} className="flex items-center gap-1">
                  {statusIcon(doc.status)}
                  {statusLabel(doc.status)}
                </Badge>

                <button
                  type="button"
                  onClick={() => handleDownload(doc.id)}
                  disabled={loadingDownload === doc.id}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-ink"
                  aria-label="Ver documento"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>

                {confirmDeleteId === doc.id ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      disabled={isPending}
                      className="rounded-xl bg-danger-500 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink-muted"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(doc.id)}
                    disabled={isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-danger-50 hover:text-danger-500"
                    aria-label="Eliminar documento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-700">
        <p className="font-semibold">¿Cómo funciona la verificación?</p>
        <p className="mt-1 text-xs leading-relaxed">
          El equipo de Chamby revisará tus documentos en un plazo de 1-3 días hábiles.
          Una vez verificados, aparecerán insignias en tu perfil que aumentan la confianza
          de los empleadores.
        </p>
      </div>
    </div>
  );
}
