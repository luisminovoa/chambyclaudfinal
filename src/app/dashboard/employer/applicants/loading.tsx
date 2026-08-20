import { AntLoader } from "@/components/brand/AntLoader";
import { Skeleton, StatCardSkeleton } from "@/components/ui/Skeleton";

export default function EmployerApplicantsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <AntLoader label="Buscando postulantes..." className="mb-8" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <Skeleton className="mt-8 h-10 w-full max-w-md rounded-xl" />
      <Skeleton className="mt-4 h-24 w-full rounded-2xl" />

      <div className="card mt-6 space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
