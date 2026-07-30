import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { AssignmentCard, type AssignmentView } from "@/components/assignments/AssignmentCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import type { AssignmentStatus, Job, Profile } from "@/lib/types";

interface AssignmentRow {
  id: string;
  status: AssignmentStatus;
  agreed_pay: number | null;
  created_at: string;
  job_id: string;
  employer_id: string;
  job: Pick<Job, "id" | "title" | "city" | "district" | "work_date" | "pay_type"> | null;
  employer: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export default async function WorkerAssignmentsPage() {
  const supabase = createClient();
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/worker/assignments");

  const { data } = await supabase
    .from("job_assignments")
    .select(
      "id, status, agreed_pay, created_at, job_id, employer_id, " +
        "job:jobs(id, title, city, district, work_date, pay_type), " +
        "employer:profiles!job_assignments_employer_id_fkey(id, full_name, avatar_url)"
    )
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (data as unknown as AssignmentRow[]) ?? [];

  const assignments: AssignmentView[] = rows
    .filter((r) => r.job !== null && r.employer !== null)
    .map((r) => {
      const job = r.job as NonNullable<AssignmentRow["job"]>;
      const employer = r.employer as NonNullable<AssignmentRow["employer"]>;
      return {
        id: r.id,
        status: r.status,
        agreedPay: r.agreed_pay,
        createdAt: r.created_at,
        jobId: job.id,
        jobTitle: job.title,
        jobCity: job.city,
        jobDistrict: job.district,
        jobWorkDate: job.work_date,
        payType: job.pay_type,
        counterpartId: employer.id,
        counterpartName: employer.full_name,
        counterpartAvatar: employer.avatar_url,
      };
    });

  const activeCount = assignments.filter(
    (a) => a.status === "asignado" || a.status === "confirmado" || a.status === "en_progreso"
  ).length;
  const inProgressCount = assignments.filter((a) => a.status === "en_progreso").length;
  const completedCount = assignments.filter((a) => a.status === "completado").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/dashboard/worker"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Mi panel
      </Link>

      <Reveal>
        <header className="mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Mis trabajos
          </h1>
          <p className="mt-1 text-ink-muted">
            Las chambas para las que fuiste contratado y su avance.
          </p>
        </header>
      </Reveal>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard icon={Briefcase} label="Activos" value={activeCount} />
        <StatCard icon={Loader2} label="En progreso" value={inProgressCount} tone="warning" />
        <StatCard
          icon={CheckCircle2}
          label="Completados"
          value={completedCount}
          tone="success"
        />
      </div>

      <div className="mt-6 space-y-4">
        {assignments.length === 0 ? (
          <EmptyState
            pose="search"
            title="Todavía no te contrataron"
            description="Postula a las chambas que más te interesen; cuando te contraten aparecerán aquí."
            actionLabel="Buscar chambas"
            actionHref="/dashboard/worker/jobs"
          />
        ) : (
          assignments.map((a) => <AssignmentCard key={a.id} assignment={a} viewer="worker" />)
        )}
      </div>
    </div>
  );
}
