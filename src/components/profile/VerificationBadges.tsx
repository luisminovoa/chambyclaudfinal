import { CheckCircle2, Circle } from "lucide-react";
import { BADGE_CONFIG } from "@/lib/badge-config";

/**
 * Insignias de confianza en un perfil público — compartido entre
 * WorkerPublicProfileView, EmployerPublicProfileView y
 * AdminProfileVerification para no duplicar el mapeo icono/color/label
 * de BADGE_CONFIG en cada uno.
 *
 * BADGE_CONFIG se importa desde src/lib/badge-config.ts (sin "use
 * client") y no desde VerificationTab.tsx — ese archivo SÍ tiene "use
 * client", y Next.js trata cualquier export de un módulo "use client"
 * como una referencia de cliente, incluso un objeto plano sin hooks. Eso
 * rompía este Server Component en producción con "Cannot access X.icon
 * on the server. You cannot dot into a client module from a server
 * component." — pero solo para perfiles con al menos una insignia
 * ganada (el antiguo `if (badges.length === 0) return null` evitaba que
 * el bug se disparara en cualquier perfil sin insignias).
 *
 * Fase 2 / C4-G11: el reporte real de un usuario ("faltaría más
 * información... si no lo está debería señalarlo también") detectó que
 * este componente solo mostraba lo que el trabajador SÍ tenía verificado
 * — sin ninguna insignia, la sección entera desaparecía (`return null`),
 * y un empleador nunca podía distinguir "no verificado" de "no hay datos
 * en esta página". Las 3 verificaciones documentales (identidad, RUC,
 * certificación) ahora se muestran SIEMPRE, con su estado real
 * (verificado/no verificado) en vez de solo aparecer cuando ya se ganó.
 * `top_profile` NO es una verificación documental (es
 * completion_percentage >= 80, ver computeAndSaveProfileStats() en
 * profile.ts) y se sigue mostrando únicamente cuando está presente, sin
 * un opuesto "no destacado" — mostrarlo como fila fija sería presentarlo
 * como si fuera un documento pendiente de verificar, que no lo es.
 */
const DOCUMENT_ROWS: {
  key: "identity_verified" | "ruc_active" | "certified_professional";
  rowLabel: string;
  verifiedText: string;
  unverifiedText: string;
}[] = [
  { key: "identity_verified", rowLabel: "Identidad", verifiedText: "Verificada", unverifiedText: "No verificada" },
  { key: "ruc_active", rowLabel: "RUC", verifiedText: "Verificado", unverifiedText: "No verificado" },
  {
    key: "certified_professional",
    rowLabel: "Certificación profesional",
    verifiedText: "Verificada",
    unverifiedText: "No verificada",
  },
];

export function VerificationBadges({ badges }: { badges: string[] }) {
  const isTopProfile = badges.includes("top_profile");
  const topProfileCfg = BADGE_CONFIG.top_profile;
  const TopProfileIcon = topProfileCfg.icon;

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-bold text-ink">Verificación</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {DOCUMENT_ROWS.map(({ key, rowLabel, verifiedText, unverifiedText }) => {
          const cfg = BADGE_CONFIG[key];
          const earned = badges.includes(key);
          const Icon = cfg.icon;
          return (
            <div
              key={key}
              className={`flex items-start gap-3 rounded-2xl border p-4 transition-all ${
                earned ? `${cfg.bg} ${cfg.border}` : "border-slate-100 bg-slate-50 opacity-50 grayscale"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  earned ? cfg.bg : "bg-slate-100"
                }`}
              >
                {earned ? (
                  <Icon className={`h-5 w-5 ${cfg.color}`} />
                ) : (
                  <Icon className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{rowLabel}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {earned ? (
                    <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  )}
                  <p className={`text-xs font-medium ${earned ? cfg.color : "text-ink-muted"}`}>
                    {earned ? verifiedText : unverifiedText}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isTopProfile && (
        <span
          className={`mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${topProfileCfg.bg} ${topProfileCfg.color} ${topProfileCfg.border}`}
        >
          <TopProfileIcon className="h-3.5 w-3.5" />
          {topProfileCfg.label}
        </span>
      )}
    </div>
  );
}
