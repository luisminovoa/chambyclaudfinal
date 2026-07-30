import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserCheck, Loader2, CheckCircle2 } from "lucide-react";
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
  worker_id: string;
  job: Pick<Job, "id" | "title" | "city" | "district" | "work_date" | "pay_type"> | null;
  worker: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export default async function EmployerAssignmentsPage() {
  const supabase = createClient();
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard/employer/assignments");

  const { data } = await supabase
    .from("job_assignments")
    .select(
      "id, status, agreed_pay, created_at, job_id, worker_id, " +
        "job:jobs(id, title, city, district, work_date, pay_type), " +
        "worker:profiles!job_assignments_worker_id_fkey(id, full_name, avatar_url)"
    )
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (data as unknown as AssignmentRow[]) ?? [];

  const assignments: AssignmentView[] = rows
    .filter((r) => r.job !== null && r.worker !== null)
    .map((r) => {
      const job = r.job as NonNullable<AssignmentRow["job"]>;
      const worker = r.worker as NonNullable<AssignmentRow["worker"]>;
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
        counterpartId: worker.id,
        counterpartName: worker.full_name,
        counterpartAvatar: worker.avatar_url,
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
        href="/dashboard/employer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Mi panel
      </Link>

      <Reveal>
        <header className="mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Mis contrataciones
          </h1>
          <p className="mt-1 text-ink-muted">
            Sigue el avance de cada trabajador que contrataste.
          </p>
        </header>
      </Reveal>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard icon={UserCheck} label="Activas" value={activeCount} />
        <StatCard icon={Loader2} label="En progreso" value={inProgressCount} tone="warning" />
        <StatCard
          icon={CheckCircle2}
          label="Completadas"
          value={completedCount}
          tone="success"
        />
      </div>

      <div className="mt-6 space-y-4">
        {assignments.length === 0 ? (
          <EmptyState
            pose="briefcase"
            title="Aún no contrataste a nadie"
            description="Cuando contrates a un postulante, la contratación aparecerá aquí con su avance."
            actionLabel="Ver mis publicaciones"
            actionHref="/dashboard/employer"
          />
        ) : (
          assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} viewer="employer" />
          ))
        )}
      </div>
    </div>
  );
}
