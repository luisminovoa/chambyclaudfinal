import { createClient } from "@/lib/supabase/server";

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
    { label: "Usuarios totales", value: totalUsers ?? 0 },
    { label: "Trabajadores", value: totalWorkers ?? 0 },
    { label: "Empleadores", value: totalEmployers ?? 0 },
    { label: "Trabajos publicados", value: totalJobs ?? 0 },
    { label: "Trabajos abiertos", value: openJobs ?? 0 },
    { label: "Trabajos completados", value: completedJobs ?? 0 },
    { label: "Postulaciones", value: totalApplications ?? 0 },
    { label: "Calificaciones", value: totalRatings ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Resumen general</h1>
      <p className="mt-1 text-slate-500">Métricas clave de la plataforma Chamby.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-xs font-medium uppercase text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
