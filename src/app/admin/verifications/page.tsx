import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { listVerificationDocuments } from "@/lib/actions/admin";
import { AdminVerificationRow } from "@/components/admin/AdminVerificationRow";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Verificaciones | Admin Chamby" };

type FilterValue = "all" | DocumentStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "verified", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
];

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = (FILTERS.some((f) => f.value === searchParams.filter)
    ? searchParams.filter
    : "pending") as FilterValue;

  const { documents, counts } = await listVerificationDocuments(filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Verificaciones
        </h1>
        <p className="mt-1 text-ink-muted">Revisa los documentos que los trabajadores subieron.</p>
      </Reveal>

      {/* Contadores */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <Reveal>
          <StatCard icon={Clock} label="Pendientes" value={counts.pending} tone="warning" />
        </Reveal>
        <Reveal delay={0.05}>
          <StatCard icon={CheckCircle2} label="Aprobados" value={counts.verified} tone="success" />
        </Reveal>
        <Reveal delay={0.1}>
          <StatCard icon={XCircle} label="Rechazados" value={counts.rejected} tone="danger" />
        </Reveal>
      </div>

      {/* Filtros */}
      <Reveal delay={0.1}>
        <div className="mt-8 flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "pending" ? "/admin/verifications" : `/admin/verifications?filter=${f.value}`}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                filter === f.value
                  ? "bg-primary-50 text-primary-700"
                  : "text-ink-muted hover:bg-slate-50 hover:text-ink"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="card mt-4 overflow-x-auto p-6">
          {documents.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No hay documentos aquí"
              description="Cuando un trabajador suba documentos de verificación, aparecerán en esta bandeja."
            />
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3 font-semibold">Trabajador</th>
                  <th className="pb-3 font-semibold">Tipo de documento</th>
                  <th className="pb-3 font-semibold">Fecha de envío</th>
                  <th className="pb-3 font-semibold">Estado</th>
                  <th className="pb-3 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <AdminVerificationRow key={doc.id} document={doc} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Reveal>
    </div>
  );
}
