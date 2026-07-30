import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface JobPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string>;
}

function pageUrl(page: number, searchParams: Record<string, string>) {
  const params = new URLSearchParams(searchParams);
  params.set("page", String(page));
  return `/dashboard/worker/jobs?${params.toString()}`;
}

export function JobPagination({
  currentPage,
  totalPages,
  searchParams,
}: JobPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3">
      {currentPage > 1 ? (
        <Link
          href={pageUrl(currentPage - 1, searchParams)}
          className="btn-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Link>
      ) : (
        <span className="btn-secondary cursor-not-allowed opacity-40">
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </span>
      )}

      <span className="text-sm font-medium text-ink-muted">
        {currentPage} / {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link
          href={pageUrl(currentPage + 1, searchParams)}
          className="btn-secondary"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="btn-secondary cursor-not-allowed opacity-40">
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}
