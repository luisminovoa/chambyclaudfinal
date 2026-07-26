import { Skeleton } from "@/components/ui/Skeleton";

export default function JobDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Skeleton className="h-4 w-64" />
      <div className="card mt-4 p-6 sm:p-8">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="mt-3 h-9 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="mt-6 h-20 rounded-2xl" />
      </div>
    </div>
  );
}
