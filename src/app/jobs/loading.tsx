import { Skeleton, JobCardSkeleton } from "@/components/ui/Skeleton";
import { AntLoader } from "@/components/brand/AntLoader";

export default function JobsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <AntLoader label="Buscando chambas..." className="mb-8" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-72" />
      <Skeleton className="mt-6 h-40 rounded-3xl sm:h-24" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
