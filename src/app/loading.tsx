import { Skeleton, JobCardSkeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-col items-center">
        <Skeleton className="h-6 w-56 rounded-full" />
        <Skeleton className="mt-5 h-12 w-full max-w-2xl" />
        <Skeleton className="mt-3 h-12 w-2/3 max-w-xl" />
        <Skeleton className="mt-8 h-16 w-full max-w-2xl rounded-full" />
      </div>
      <div className="mt-14 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
