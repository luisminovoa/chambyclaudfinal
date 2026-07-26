import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { AntIllustration, type AntPose } from "@/components/brand/AntIllustration";

interface EmptyStateProps {
  /** Pose de la hormiguita; tiene prioridad sobre `icon` */
  pose?: AntPose;
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  pose,
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      {pose ? (
        <AntIllustration pose={pose} className="w-28 text-primary-500" />
      ) : (
        Icon && (
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-50 text-primary-600">
            <Icon className="h-8 w-8" strokeWidth={1.75} />
          </span>
        )
      )}
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-primary mt-6">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
