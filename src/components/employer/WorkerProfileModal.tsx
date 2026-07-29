"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ShieldCheck, Star, MapPin, Briefcase, Phone } from "lucide-react";
import { getWorkerFullProfile, type WorkerFullProfile } from "@/lib/actions/applications";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { AntLoader } from "@/components/brand/AntLoader";
import { chambyLevel, formatDate, workerBadges } from "@/lib/utils";

const DOCUMENT_LABELS: Record<string, string> = {
  dni: "DNI",
  ruc: "RUC",
  antecedentes_policiales: "Antecedentes policiales",
  antecedentes_penales: "Antecedentes penales",
  certificado: "Certificado",
  licencia: "Licencia",
  carnet: "Carnet",
  otro: "Otro documento",
};

export function WorkerProfileModal({
  workerId,
  workerName,
  onClose,
}: {
  workerId: string;
  workerName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<WorkerFullProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkerFullProfile(workerId).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError(res.error ?? "No se pudo cargar el perfil.");
      else setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const level = data ? chambyLevel(data.completedJobs) : null;
  const badges = data
    ? workerBadges(data.documents.length > 0, data.completedJobs, data.averageRating)
    : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={`Perfil de ${workerName}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-ink">Perfil del postulante</h2>
            <button
              onClick={onClose}
              aria-label="Cerrar perfil"
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {error && <p className="text-sm text-danger-600">{error}</p>}

            {!data && !error && (
              <div className="flex justify-center py-16">
                <AntLoader label="Cargando perfil…" />
              </div>
            )}

            {data && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Avatar
                    name={data.profile.full_name}
                    src={data.profile.avatar_url}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-ink">
                      {data.profile.full_name}
                    </h3>
                    {data.profile.category && (
                      <p className="text-sm text-ink-muted">{data.profile.category}</p>
                    )}
                    {level && (
                      <span
                        className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${level.color}`}
                      >
                        Nivel {level.level} · {level.label}
                      </span>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-slate-50 px-2 py-3">
                    <dt className="text-[11px] font-medium text-ink-muted">Trabajos</dt>
                    <dd className="text-lg font-bold text-ink">{data.completedJobs}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-2 py-3">
                    <dt className="text-[11px] font-medium text-ink-muted">Calificación</dt>
                    <dd className="flex items-center justify-center gap-1 text-lg font-bold text-ink">
                      {data.averageRating !== null ? (
                        <>
                          <Star className="h-4 w-4 fill-sun-400 text-sun-400" />
                          {data.averageRating.toFixed(1)}
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-2 py-3">
                    <dt className="text-[11px] font-medium text-ink-muted">Reseñas</dt>
                    <dd className="text-lg font-bold text-ink">{data.totalRatings}</dd>
                  </div>
                </dl>

                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {badges.map((b) => (
                      <Badge key={b} tone={b === "Verificado" ? "success" : "primary"}>
                        {b === "Verificado" && <ShieldCheck className="h-3 w-3" />}
                        {b}
                      </Badge>
                    ))}
                  </div>
                )}

                <ul className="space-y-2 text-sm text-ink-muted">
                  {data.profile.city && (
                    <li className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-primary-500" />
                      {data.profile.city}
                    </li>
                  )}
                  {data.profile.category && (
                    <li className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 shrink-0 text-primary-500" />
                      {data.profile.category}
                    </li>
                  )}
                  {data.profile.phone && (
                    <li className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-primary-500" />
                      {data.profile.phone}
                    </li>
                  )}
                </ul>

                {data.profile.bio && (
                  <section>
                    <h4 className="mb-2 text-sm font-bold text-ink">Sobre mí</h4>
                    <p className="whitespace-pre-line text-sm text-ink-muted">
                      {data.profile.bio}
                    </p>
                  </section>
                )}

                {data.profile.skills.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-bold text-ink">Especialidades</h4>
                    <div className="flex flex-wrap gap-2">
                      {data.profile.skills.map((s) => (
                        <Badge key={s} tone="neutral">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {data.documents.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-bold text-ink">Documentos verificados</h4>
                    <ul className="space-y-2">
                      {data.documents.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-sm font-medium text-success-700"
                        >
                          <ShieldCheck className="h-4 w-4 shrink-0" />
                          {DOCUMENT_LABELS[d.document_type] ?? d.document_type}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {data.photos.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-bold text-ink">Galería de trabajos</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {data.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.public_url}
                          alt=""
                          className="aspect-square w-full rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  </section>
                )}

                {data.recentRatings.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-bold text-ink">Últimas calificaciones</h4>
                    <ul className="space-y-3">
                      {data.recentRatings.map((r, i) => (
                        <li key={i} className="rounded-2xl border border-slate-100 px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, s) => (
                                <Star
                                  key={s}
                                  className={`h-3.5 w-3.5 ${
                                    s < r.score
                                      ? "fill-sun-400 text-sun-400"
                                      : "text-slate-200"
                                  }`}
                                />
                              ))}
                            </span>
                            <span className="text-xs text-ink-muted">
                              {formatDate(r.created_at)}
                            </span>
                          </div>
                          {r.comment && (
                            <p className="mt-1.5 text-sm text-ink-muted">{r.comment}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
