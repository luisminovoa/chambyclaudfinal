import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function JobCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-2xl" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5">
      <Skeleton className="h-10 w-10 rounded-2xl" />
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}
