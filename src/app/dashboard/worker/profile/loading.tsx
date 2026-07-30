import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Back link */}
      <Skeleton className="mb-6 h-5 w-28" />

      {/* Profile header */}
      <div className="card mb-8 flex flex-col items-center gap-4 p-6 sm:flex-row">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="w-full flex-1 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>

      {/* Tabs nav */}
      <Skeleton className="mb-6 h-12 w-full rounded-2xl" />

      {/* Tab content */}
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    </div>
  );
}
