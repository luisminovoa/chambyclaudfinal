import { JobCardSkeleton } from "@/components/ui/Skeleton";

export default function WorkerJobsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-8 w-52 rounded-xl" />
        <div className="skeleton h-4 w-36 rounded-lg" />
      </div>
      <div className="skeleton card h-16 rounded-3xl" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
