import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, CheckCircle2, Clock, Users, XCircle } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import {
  listEmployerApplicants,
  getEmployerApplicantCounts,
  listEmployerJobOptions,
} from "@/lib/actions/employer-applicants";
import { ApplicantRow } from "@/components/ApplicantRow";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Postulantes | Chamby" };

interface SearchParams {
  status?: string;
  jobId?: string;
}

/**
 * Estados reales del enum `application_status` (0001_init.sql:24) —
 * no se inventa ninguno. "Todos" es un filtro de UI, no un estado.
 */
const STATUS_TABS = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "aceptado", label: "Aceptados" },
  { value: "rechazado", label: "Rechazados" },
  { value: "retirado", label: "Retirados" },
] as const;

function tabHref(params: SearchParams, status: string): string {
  const usp = new URLSearchParams();
  if (status !== "all") usp.set("status", status);
  if (params.jobId) usp.set("jobId", params.jobId);
  const qs = usp.toString();
  return qs ? `/dashboard/employer/applicants?${qs}` : "/dashboard/employer/applicants";
}

export default async function EmployerApplicantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/employer/applicants");
  // Autorización por rol POSEÍDO, mismo criterio que
  // /dashboard/employer/profile — no por modo activo.
  if (!profile || !userRoles.includes("employer")) redirect("/dashboard");

  // searchParams validados contra lista blanca antes de tocar la query
  // (mismo patrón que /admin/reports).
  const status = STATUS_TABS.some((t) => t.value === searchParams.status)
    ? (searchParams.status as string)
    : "all";

  const [jobs, counts] = await Promise.all([
    listEmployerJobOptions(),
    getEmployerApplicantCounts(),
  ]);

  // Un jobId que no pertenezca al empleador se descarta aquí y también
  // en la Server Action — nunca llega a la consulta.
  const jobId = jobs.some((j) => j.id === searchParams.jobId) ? searchParams.jobId : undefined;

  const applicants = await listEmployerApplicants({
    status: status === "all" ? undefined : status,
    jobId,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <Link
          href="/dashboard/employer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Postulantes
        </h1>
        <p className="mt-1 text-ink-muted">
          Todas las personas que postularon a tus publicaciones.
        </p>
      </Reveal>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal>
          <StatCard icon={Users} label="Total" value={counts.all} tone="neutral" />
        </Reveal>
        <Reveal delay={0.05}>
          <StatCard icon={Clock} label="Pendientes" value={counts.pendiente} tone="warning" />
        </Reveal>
        <Reveal delay={0.1}>
          <StatCard icon={CheckCircle2} label="Aceptados" value={counts.aceptado} tone="success" />
        </Reveal>
        <Reveal delay={0.15}>
          <StatCard icon={XCircle} label="Rechazados" value={counts.rechazado} tone="neutral" />
        </Reveal>
      </div>

      {/* Filtro por estado */}
      <Reveal delay={0.1}>
        <div className="no-scrollbar mt-8 flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              href={tabHref(searchParams, t.value)}
              aria-current={status === t.value ? "page" : undefined}
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

      {/* Filtro por publicación — <form method="get"> para que funcione sin JS */}
      {jobs.length > 0 && (
        <Reveal delay={0.15}>
          <form className="card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end" method="get">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <div className="min-w-0 flex-1">
              <label htmlFor="jobId" className="label">
                Publicación
              </label>
              <select id="jobId" name="jobId" defaultValue={jobId ?? ""} className="input text-sm">
                <option value="">Todas mis publicaciones</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-secondary justify-center">
                Filtrar
              </button>
              {jobId && (
                <Link href={tabHref({ status: searchParams.status }, status)} className="btn-ghost">
                  Limpiar
                </Link>
              )}
            </div>
          </form>
        </Reveal>
      )}

      <Reveal delay={0.2}>
        <section className="card mt-6 p-6" aria-labelledby="lista-postulantes">
          <h2 id="lista-postulantes" className="text-base font-bold text-ink">
            {applicants.length}{" "}
            {applicants.length === 1 ? "postulante" : "postulantes"}
          </h2>

          {applicants.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                pose="search"
                title="La hormiguita no encontró postulantes aquí"
                description={
                  jobs.length === 0
                    ? "Publica tu primera chamba para empezar a recibir postulaciones."
                    : "Prueba con otro estado o con otra publicación."
                }
                actionLabel={jobs.length === 0 ? "Publicar una chamba" : undefined}
                actionHref={jobs.length === 0 ? "/jobs/new" : undefined}
              />
            </div>
          ) : (
            <div className="mt-2">
              {applicants.map((a) => (
                <ApplicantRow
                  key={a.id}
                  applicationId={a.id}
                  jobId={a.jobId}
                  jobTitle={a.jobTitle}
                  appliedAt={a.createdAt}
                  status={a.status}
                  worker={a.worker}
                  occupation={a.occupation}
                  ratingSummary={a.ratingSummary}
                  // Mismo criterio que /jobs/[id]: solo una publicación
                  // abierta admite aceptar/rechazar.
                  canManage={a.jobStatus === "abierto"}
                />
              ))}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}
