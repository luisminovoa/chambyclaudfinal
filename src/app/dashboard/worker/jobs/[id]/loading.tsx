import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkerJobDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Skeleton className="mb-5 h-8 w-36 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="aspect-video rounded-2xl" />
          <div className="card p-6 space-y-4">
            <Skeleton className="h-7 w-3/4 rounded-lg" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6 space-y-2">
            <Skeleton className="h-5 w-44 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-4/6 rounded" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-6 space-y-3">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
          <div className="card p-6 space-y-3">
            <Skeleton className="h-5 w-28 rounded-lg" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-2xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
