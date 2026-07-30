import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "A convenir";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function payTypeLabel(payType: string): string {
  const labels: Record<string, string> = {
    por_hora: "por hora",
    por_dia: "por día",
    fijo: "monto fijo",
  };
  return labels[payType] ?? payType;
}

export function jobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    borrador: "Borrador",
    abierto: "Abierto",
    en_progreso: "En progreso",
    completado: "Completado",
    cancelado: "Cancelado",
  };
  return labels[status] ?? status;
}

export function jobStatusColor(status: string): string {
  const colors: Record<string, string> = {
    abierto: "bg-green-100 text-green-700",
    en_progreso: "bg-blue-100 text-blue-700",
    completado: "bg-gray-200 text-gray-700",
    cancelado: "bg-red-100 text-red-700",
  };
  return colors[status] ?? "bg-gray-100 text-gray-700";
}

export function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    preseleccionado: "Preseleccionado",
    aceptado: "Aceptado",
    rechazado: "Rechazado",
    retirado: "Retirado",
  };
  return labels[status] ?? status;
}

export function assignmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    asignado: "Asignado",
    confirmado: "Confirmado",
    en_progreso: "En progreso",
    completado: "Completado",
    cancelado: "Cancelado",
  };
  return labels[status] ?? status;
}

const CHAMBY_LEVELS = [
  { min: 20, level: 4, label: "Maestro", color: "text-sun-600 bg-sun-50 border-sun-200" },
  { min: 10, level: 3, label: "Experto", color: "text-primary-700 bg-primary-50 border-primary-200" },
  { min: 3, level: 2, label: "Profesional", color: "text-success-700 bg-success-50 border-success-200" },
  { min: 0, level: 1, label: "Nuevo", color: "text-gray-600 bg-gray-100 border-gray-200" },
];

export function chambyLevel(completedJobs: number): {
  level: number;
  label: string;
  color: string;
} {
  const match = CHAMBY_LEVELS.find((l) => completedJobs >= l.min);
  return match ?? CHAMBY_LEVELS[CHAMBY_LEVELS.length - 1];
}

export function workerBadges(
  isVerified: boolean,
  completedJobs: number,
  avgRating: number | null
): string[] {
  const badges: string[] = [];
  if (isVerified) badges.push("Verificado");
  if (avgRating !== null && avgRating >= 4.5) badges.push("Top Rated");
  if (completedJobs >= 10) badges.push("Veterano");
  else if (completedJobs >= 3) badges.push("Experimentado");
  else if (completedJobs === 0) badges.push("Nuevo");
  return badges;
}

export function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return formatDate(dateString);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}
