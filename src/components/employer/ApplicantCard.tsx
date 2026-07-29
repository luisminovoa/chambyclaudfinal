"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Star,
  MapPin,
  ShieldCheck,
  Eye,
  BookmarkCheck,
  BookmarkX,
  UserCheck,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  shortlistApplication,
  removeShortlist,
  hireWorker,
  rejectApplication,
} from "@/lib/actions/applications";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, jobStatusTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toaster";
import { WorkerProfileModal } from "@/components/employer/WorkerProfileModal";
import { applicationStatusLabel, chambyLevel, timeAgo, workerBadges } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/types";

export interface ApplicantView {
  applicationId: string;
  status: ApplicationStatus;
  message: string | null;
  appliedAt: string;
  workerId: string;
  fullName: string;
  avatarUrl: string | null;
  city: string | null;
  category: string | null;
  skills: string[];
  compatibility: number;
  completedJobs: number;
  averageRating: number | null;
  totalRatings: number;
  isVerified: boolean;
}

export function ApplicantCard({
  applicant,
  vacanciesLeft,
}: {
  applicant: ApplicantView;
  vacanciesLeft: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [showProfile, setShowProfile] = useState(false);
  const [confirmingHire, setConfirmingHire] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const level = chambyLevel(applicant.completedJobs);
  const badges = workerBadges(
    applicant.isVerified,
    applicant.completedJobs,
    applicant.averageRating
  );
  const isOpen = applicant.status === "pendiente" || applicant.status === "preseleccionado";

  function run(
    action: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.error) toast(res.error, "error");
      else {
        toast(successMessage, "success");
        router.refresh();
      }
    });
  }

  return (
    <>
      <motion.article
        layout
        className="card p-5"
        data-status={applicant.status}
      >
        <div className="flex items-start gap-4">
          <Avatar name={applicant.fullName} src={applicant.avatarUrl} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold text-ink">{applicant.fullName}</h3>
              <Badge tone={jobStatusTone(applicant.status)}>
                {applicationStatusLabel(applicant.status)}
              </Badge>
            </div>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              {applicant.category && <span>{applicant.category}</span>}
              {applicant.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {applicant.city}
                </span>
              )}
              <span>Postuló {timeAgo(applicant.appliedAt)}</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${level.color}`}
              >
                Nivel {level.level} · {level.label}
              </span>
              {applicant.averageRating !== null && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
                  <Star className="h-3.5 w-3.5 fill-sun-400 text-sun-400" />
                  {applicant.averageRating.toFixed(1)}
                  <span className="font-normal text-ink-muted">
                    ({applicant.totalRatings})
                  </span>
                </span>
              )}
              {badges
                .filter((b) => b !== level.label)
                .map((b) => (
                  <Badge key={b} tone={b === "Verificado" ? "success" : "neutral"}>
                    {b === "Verificado" && <ShieldCheck className="h-3 w-3" />}
                    {b}
                  </Badge>
                ))}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-2xl font-black text-primary-600">{applicant.compatibility}%</p>
            <p className="text-[11px] font-medium text-ink-muted">compatible</p>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
            style={{ width: `${applicant.compatibility}%` }}
          />
        </div>

        {applicant.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {applicant.skills.slice(0, 6).map((s) => (
              <span
                key={s}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {applicant.message && (
          <blockquote className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-ink-muted">
            {applicant.message}
          </blockquote>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setShowProfile(true)}
            className="btn-secondary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver perfil
          </button>

          {applicant.status === "pendiente" && (
            <button
              disabled={isPending}
              onClick={() =>
                run(() => shortlistApplication(applicant.applicationId), "Postulante preseleccionado")
              }
              className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Preseleccionar
            </button>
          )}

          {applicant.status === "preseleccionado" && (
            <button
              disabled={isPending}
              onClick={() =>
                run(() => removeShortlist(applicant.applicationId), "Preselección retirada")
              }
              className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <BookmarkX className="h-3.5 w-3.5" />
              Quitar preselección
            </button>
          )}

          {isOpen && vacanciesLeft > 0 && (
            <button
              disabled={isPending}
              onClick={() => setConfirmingHire(true)}
              className="btn-primary !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Contratar
            </button>
          )}

          {isOpen && (
            <button
              disabled={isPending}
              onClick={() =>
                run(() => rejectApplication(applicant.applicationId), "Postulación rechazada")
              }
              className="btn-danger !min-h-0 !rounded-xl !px-3 !py-2 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              Rechazar
            </button>
          )}
        </div>

        {confirmingHire && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-primary-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              ¿Contratar a {applicant.fullName}? Quedan {vacanciesLeft} vacante
              {vacanciesLeft !== 1 && "s"}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingHire(false)}
                className="btn-ghost !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Cancelar
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setConfirmingHire(false);
                  run(() => hireWorker(applicant.applicationId), "¡Trabajador contratado!");
                }}
                className="btn-primary !min-h-0 !rounded-xl !px-3 !py-1.5 text-xs"
              >
                Sí, contratar
              </button>
            </div>
          </div>
        )}
      </motion.article>

      {showProfile && (
        <WorkerProfileModal
          workerId={applicant.workerId}
          workerName={applicant.fullName}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
