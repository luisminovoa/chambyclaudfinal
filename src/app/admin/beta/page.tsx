import {
  Users,
  UserCheck,
  Briefcase,
  CheckCircle2,
  MessageCircle,
  Send,
  Bell,
  Bug,
  Star,
  Clock,
  Monitor,
  Globe,
  MapPin,
} from "lucide-react";
import type { Metadata } from "next";
import { getBetaStats, getBugReports } from "@/lib/actions/beta";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { BETA_CONFIG } from "@/lib/beta-config";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export const metadata: Metadata = { title: "Beta Privada | Admin Chamby" };

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

export default async function AdminBetaPage() {
  const [stats, reports] = await Promise.all([getBetaStats(), getBugReports(20)]);

  const metricCards = [
    { label: "Usuarios registrados", value: stats.totalUsers, icon: Users, tone: "primary" as const },
    { label: "Usuarios activos", value: stats.activeUsers, icon: UserCheck, tone: "success" as const },
    { label: "Trabajos publicados", value: stats.totalJobs, icon: Briefcase, tone: "neutral" as const },
    { label: "Trabajos completados", value: stats.completedJobs, icon: CheckCircle2, tone: "success" as const },
    { label: "Conversaciones", value: stats.totalConversations, icon: MessageCircle, tone: "primary" as const },
    { label: "Mensajes enviados", value: stats.totalMessages, icon: Send, tone: "primary" as const },
    { label: "Notificaciones", value: stats.totalNotifications, icon: Bell, tone: "warning" as const },
    { label: "Errores reportados", value: stats.bugReports, icon: Bug, tone: "danger" as const },
    {
      label: "Calificación promedio",
      value: stats.avgRating !== null ? stats.avgRating.toFixed(1) + " ★" : "—",
      icon: Star,
      tone: "warning" as const,
    },
    {
      label: "Tiempo prom. contratación",
      value: formatMinutes(stats.avgHireMinutes),
      icon: Clock,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Panel Beta Privada
          </h1>
          <span className="rounded-full bg-warning-50 border border-warning-300 px-3 py-1 text-xs font-bold text-warning-700 uppercase tracking-wide">
            {BETA_CONFIG.version} · {BETA_CONFIG.deployDate}
          </span>
        </div>
        <p className="mt-1 text-ink-muted">
          Métricas en tiempo real para el seguimiento de la beta privada.
        </p>
      </Reveal>

      {/* Stat grid */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {metricCards.map((s, i) => (
          <Reveal key={s.label} delay={Math.min(i * 0.03, 0.2)}>
            <StatCard icon={s.icon} label={s.label} value={s.value} tone={s.tone} />
          </Reveal>
        ))}
      </div>

      {/* Bug reports */}
      <Reveal delay={0.15}>
        <h2 className="mt-12 mb-4 text-lg font-bold text-ink">
          Reportes de error recientes
          {stats.bugReports > 0 && (
            <span className="ml-2 rounded-full bg-danger-100 px-2 py-0.5 text-xs font-bold text-danger-700">
              {stats.bugReports} total
            </span>
          )}
        </h2>
      </Reveal>

      {reports.length === 0 ? (
        <Reveal>
          <div className="card flex flex-col items-center py-12 text-center">
            <Bug className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-ink-muted">Ningún reporte recibido todavía.</p>
          </div>
        </Reveal>
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => (
            <Reveal key={r.id} delay={Math.min(i * 0.03, 0.15)}>
              <div className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink line-clamp-2 flex-1">{r.description}</p>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {r.route}
                  </span>
                  {r.browser && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {r.browser}
                    </span>
                  )}
                  {r.os && (
                    <span className="flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      {r.os}
                    </span>
                  )}
                  {r.resolution && <span>{r.resolution}</span>}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{r.version}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
