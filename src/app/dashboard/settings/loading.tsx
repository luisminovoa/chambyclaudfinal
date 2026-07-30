import { Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Skeleton className="mb-6 h-5 w-28" />
      <Skeleton className="mb-1 h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-36 w-full rounded-3xl" />
        <Skeleton className="h-36 w-full rounded-3xl" />
      </div>
    </div>
  );
}
