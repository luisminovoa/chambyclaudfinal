import { Skeleton, StatCardSkeleton } from "@/components/ui/Skeleton";
import { AntLoader } from "@/components/brand/AntLoader";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <AntLoader label="Preparando tu panel..." className="mb-8" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-3xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </div>
  );
}
