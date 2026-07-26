import {
  Users,
  HardHat,
  Building2,
  Briefcase,
  FolderOpen,
  CheckCircle2,
  ClipboardList,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";

export default async function AdminOverviewPage() {
  const supabase = createClient();

  const [
    { count: totalUsers },
    { count: totalWorkers },
    { count: totalEmployers },
    { count: totalJobs },
    { count: openJobs },
    { count: completedJobs },
    { count: totalApplications },
    { count: totalRatings },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "worker"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "employer"),
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "abierto"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "completado"),
    supabase.from("job_applications").select("*", { count: "exact", head: true }),
    supabase.from("ratings").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Usuarios totales", value: totalUsers ?? 0, icon: Users, tone: "primary" as const },
    { label: "Trabajadores", value: totalWorkers ?? 0, icon: HardHat, tone: "primary" as const },
    { label: "Empleadores", value: totalEmployers ?? 0, icon: Building2, tone: "primary" as const },
    { label: "Trabajos publicados", value: totalJobs ?? 0, icon: Briefcase, tone: "neutral" as const },
    { label: "Trabajos abiertos", value: openJobs ?? 0, icon: FolderOpen, tone: "success" as const },
    {
      label: "Trabajos completados",
      value: completedJobs ?? 0,
      icon: CheckCircle2,
      tone: "success" as const,
    },
    {
      label: "Postulaciones",
      value: totalApplications ?? 0,
      icon: ClipboardList,
      tone: "warning" as const,
    },
    { label: "Calificaciones", value: totalRatings ?? 0, icon: Star, tone: "warning" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Resumen general
        </h1>
        <p className="mt-1 text-ink-muted">Métricas clave de la plataforma Chamby.</p>
      </Reveal>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={Math.min(i * 0.04, 0.2)}>
            <StatCard icon={s.icon} label={s.label} value={s.value} tone={s.tone} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
