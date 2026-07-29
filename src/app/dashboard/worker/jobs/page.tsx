import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { WorkerFiltersBar } from "@/components/jobs/WorkerFiltersBar";
import { WorkerJobCard } from "@/components/jobs/WorkerJobCard";
import { JobPagination } from "@/components/jobs/JobPagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { computeCompatibility } from "@/lib/compatibility";
import type { JobListing } from "@/lib/types";

const PAGE_SIZE = 15;

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export const metadata = {
  title: "Buscar Chambas",
};

export default async function WorkerJobsPage({ searchParams }: PageProps) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login?next=/dashboard/worker/jobs");
  if (!profile || (profile.role !== "worker" && profile.role !== "admin")) {
    redirect("/dashboard");
  }

  const q = str(searchParams.q);
  const category = str(searchParams.category);
  const city = str(searchParams.city);
  const district = str(searchParams.district);
  const pay_type = str(searchParams.pay_type);
  const urgency = str(searchParams.urgency);
  const pay_min = str(searchParams.pay_min);
  const pay_max = str(searchParams.pay_max);
  const date_from = str(searchParams.date_from);
  const sort = str(searchParams.sort) || "newest";
  const page = Math.max(1, Number(str(searchParams.page)) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const isCompatibilitySort = sort === "compatibility";

  const supabase = createClient();

  let query = supabase
    .from("jobs")
    .select(
      `*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city, is_active), job_images(id, public_url, display_order)`,
      { count: "exact" }
    )
    .eq("status", "abierto");

  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`);
  if (category) query = query.eq("category", category);
  if (city) query = query.ilike("city", `%${city}%`);
  if (district) query = query.ilike("district", `%${district}%`);
  if (pay_type) query = query.eq("pay_type", pay_type);
  if (urgency) query = query.eq("urgency", urgency);
  if (pay_min) query = query.gte("pay_amount", Number(pay_min));
  if (pay_max) query = query.lte("pay_amount", Number(pay_max));
  if (date_from) query = query.gte("work_date", date_from);

  if (sort === "pay_desc") {
    query = query.order("pay_amount", { ascending: false, nullsFirst: false });
  } else if (sort === "urgente") {
    query = query.order("urgency", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (isCompatibilitySort) {
    query = query.range(0, 49); // fetch top 50 for in-memory sort
  } else {
    query = query.range(offset, offset + PAGE_SIZE - 1);
  }

  const { data, count } = await query;
  const rawJobs = (data as unknown as JobListing[]) ?? [];

  // Fetch saved IDs + applied IDs + experience count in parallel
  const [savedRes, appliedRes, expRes] = await Promise.all([
    supabase.from("saved_jobs").select("job_id").eq("worker_id", user.id),
    supabase.from("job_applications").select("job_id").eq("worker_id", user.id),
    supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", user.id)
      .eq("status", "aceptado"),
  ]);

  const savedSet = new Set((savedRes.data ?? []).map((s: { job_id: string }) => s.job_id));
  const appliedSet = new Set((appliedRes.data ?? []).map((a: { job_id: string }) => a.job_id));
  const acceptedCount = expRes.count ?? 0;

  let displayJobs = rawJobs;
  if (isCompatibilitySort) {
    displayJobs = [...rawJobs].sort(
      (a, b) =>
        computeCompatibility(profile, acceptedCount, b) -
        computeCompatibility(profile, acceptedCount, a)
    );
  }

  const totalCount = isCompatibilitySort ? displayJobs.length : (count ?? 0);
  const totalPages = isCompatibilitySort ? 1 : Math.ceil(totalCount / PAGE_SIZE);

  // Serialisable filter values for child components
  const filterValues: Record<string, string> = {};
  for (const key of ["q", "category", "city", "district", "pay_type", "urgency", "pay_min", "pay_max", "date_from", "sort"]) {
    const v = str(searchParams[key]);
    if (v) filterValues[key] = v;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Reveal>
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Buscar Chambas
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {totalCount > 0
              ? `${totalCount} trabajo${totalCount !== 1 ? "s" : ""} disponible${totalCount !== 1 ? "s" : ""}`
              : "Explora los trabajos disponibles"}
          </p>
        </div>
      </Reveal>

      <WorkerFiltersBar initialFilters={filterValues} />

      <div className="mt-6">
        {displayJobs.length === 0 ? (
          <EmptyState
            pose="search"
            title="No encontramos trabajos"
            description="Prueba ajustando los filtros o ampliando tu búsqueda."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayJobs.map((job) => (
                <WorkerJobCard
                  key={job.id}
                  job={job}
                  compatibility={computeCompatibility(profile, acceptedCount, job)}
                  isSaved={savedSet.has(job.id)}
                  hasApplied={appliedSet.has(job.id)}
                />
              ))}
            </div>
            {!isCompatibilitySort && (
              <div className="mt-8">
                <JobPagination
                  currentPage={page}
                  totalPages={totalPages}
                  searchParams={filterValues}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
