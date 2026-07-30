import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, UserCheck, BookmarkCheck, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { computeCompatibility } from "@/lib/compatibility";
import { ApplicantCard, type ApplicantView } from "@/components/employer/ApplicantCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { formatCurrency, jobStatusLabel, payTypeLabel } from "@/lib/utils";
import type { ApplicationStatus, Job, Profile, RatingSummary } from "@/lib/types";

type Tab = "todos" | "pendiente" | "preseleccionado" | "aceptado" | "rechazado";

const TABS: { key: Tab; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendiente", label: "Pendientes" },
  { key: "preseleccionado", label: "Preseleccionados" },
  { key: "aceptado", label: "Contratados" },
  { key: "rechazado", label: "Rechazados" },
];

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  worker_id: string;
  worker: Profile | null;
}

export default async function JobApplicationsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect(`/login?next=/dashboard/employer/jobs/${params.id}/applications`);

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  const job = jobData as Job | null;
  if (!job) notFound();
  if (job.employer_id !== user.id) redirect("/dashboard/employer");

  const { data: applicationsData } = await supabase
    .from("job_applications")
    .select(
      "id, status, message, created_at, worker_id, worker:profiles!job_applications_worker_id_fkey(*)"
    )
    .eq("job_id", job.id)
    .order("created_at", { ascending: false });

  const applications = (applicationsData as unknown as ApplicationRow[]) ?? [];
  const workerIds = applications.map((a) => a.worker_id);
  const idFilter = workerIds.length ? workerIds : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: ratingsData }, { data: completedData }, { data: verifiedData }] =
    await Promise.all([
      supabase.from("worker_rating_summary").select("*").in("profile_id", idFilter),
      supabase
        .from("job_assignments")
        .select("worker_id")
        .in("worker_id", idFilter)
        .eq("status", "completado"),
      supabase
        .from("job_applications")
        .select("worker_id")
        .in("worker_id", idFilter)
        .eq("status", "aceptado"),
    ]);

  const ratingByWorker = new Map<string, RatingSummary>(
    ((ratingsData as unknown as RatingSummary[]) ?? []).map((r) => [r.profile_id, r])
  );

  const completedByWorker = new Map<string, number>();
  ((completedData as { worker_id: string }[]) ?? []).forEach((r) => {
    completedByWorker.set(r.worker_id, (completedByWorker.get(r.worker_id) ?? 0) + 1);
  });

  const acceptedByWorker = new Map<string, number>();
  ((verifiedData as { worker_id: string }[]) ?? []).forEach((r) => {
    acceptedByWorker.set(r.worker_id, (acceptedByWorker.get(r.worker_id) ?? 0) + 1);
  });

  const applicants: ApplicantView[] = applications
    .filter((a) => a.worker !== null)
    .map((a) => {
      const worker = a.worker as Profile;
      const rating = ratingByWorker.get(worker.id) ?? null;
      return {
        applicationId: a.id,
        status: a.status,
        message: a.message,
        appliedAt: a.created_at,
        workerId: worker.id,
        fullName: worker.full_name,
        avatarUrl: worker.avatar_url,
        city: worker.city,
        category: worker.category,
        skills: worker.skills ?? [],
        compatibility: computeCompatibility(worker, acceptedByWorker.get(worker.id) ?? 0, job),
        completedJobs: completedByWorker.get(worker.id) ?? 0,
        averageRating: rating?.average_score ?? null,
        totalRatings: rating?.total_ratings ?? 0,
        isVerified: worker.is_active,
      };
    })
    .sort((a, b) => b.compatibility - a.compatibility);

  const counts = {
    todos: applicants.length,
    pendiente: applicants.filter((a) => a.status === "pendiente").length,
    preseleccionado: applicants.filter((a) => a.status === "preseleccionado").length,
    aceptado: applicants.filter((a) => a.status === "aceptado").length,
    rechazado: applicants.filter((a) => a.status === "rechazado" || a.status === "retirado").length,
  };

  const activeTab: Tab = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as Tab)
    : "todos";

  const visible =
    activeTab === "todos"
      ? applicants
      : activeTab === "rechazado"
        ? applicants.filter((a) => a.status === "rechazado" || a.status === "retirado")
        : applicants.filter((a) => a.status === activeTab);

  const positions = Math.max(job.positions_needed, 1);
  const vacanciesLeft = Math.max(positions - counts.aceptado, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/dashboard/employer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Mis publicaciones
      </Link>

      <Reveal>
        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {job.title}
            </h1>
            <Badge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {job.city}
            {job.district && ` · ${job.district}`} · {formatCurrency(job.pay_amount)}{" "}
            {payTypeLabel(job.pay_type)}
          </p>
          <Link
            href={`/jobs/${job.id}`}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline"
          >
            <Briefcase className="h-4 w-4" />
            Ver publicación
          </Link>
        </header>
      </Reveal>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard icon={Users} label="Postulantes" value={counts.todos} />
        <StatCard
          icon={BookmarkCheck}
          label="Preseleccionados"
          value={counts.preseleccionado}
          tone="warning"
        />
        <StatCard
          icon={UserCheck}
          label="Vacantes"
          value={`${counts.aceptado}/${positions}`}
          tone="success"
          hint={vacanciesLeft > 0 ? `${vacanciesLeft} por cubrir` : "todas cubiertas"}
        />
      </div>

      <nav
        aria-label="Filtrar postulantes"
        className="mt-6 flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/employer/jobs/${job.id}/applications?tab=${t.key}`}
            scroll={false}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-primary-500 text-white"
                : "bg-slate-100 text-ink-muted hover:bg-slate-200"
            }`}
          >
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <EmptyState
            pose={counts.todos === 0 ? "search" : "lost"}
            title={
              counts.todos === 0
                ? "Todavía no hay postulantes"
                : "Nadie en esta categoría"
            }
            description={
              counts.todos === 0
                ? "En cuanto alguien postule a tu chamba, aparecerá aquí con su compatibilidad."
                : "Prueba con otro filtro para ver el resto de los postulantes."
            }
          />
        ) : (
          visible.map((a) => (
            <ApplicantCard key={a.applicationId} applicant={a} vacanciesLeft={vacanciesLeft} />
          ))
        )}
      </div>
    </div>
  );
}
