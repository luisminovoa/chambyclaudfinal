import { ShieldCheck, Building2, Award, Star } from "lucide-react";

/**
 * Config de insignias de confianza (label/descripción/ícono/color) —
 * antes vivía dentro de VerificationTab.tsx, que tiene "use client".
 * Next.js trata TODOS los exports de un archivo "use client" como
 * referencias de cliente, aunque el valor exportado sea un objeto plano
 * sin ningún hook — así que VerificationBadges.tsx (Server Component,
 * usado por WorkerPublicProfileView/EmployerPublicProfileView y por
 * AdminProfileVerification) no podía leer `cfg.icon` en el servidor:
 * "Cannot access X.icon on the server. You cannot dot into a client
 * module from a server component." Se extrae aquí, en un módulo sin
 * "use client", para que ambos lados (cliente y servidor) lo importen
 * del mismo lugar sin duplicar el mapeo.
 */
export const BADGE_CONFIG = {
  identity_verified: {
    label: "Identidad verificada",
    description: "DNI revisado y aprobado por Chamby",
    icon: ShieldCheck,
    color: "text-primary-600",
    bg: "bg-primary-50",
    border: "border-primary-200",
  },
  ruc_active: {
    label: "RUC activo",
    description: "Número de RUC validado ante SUNAT",
    icon: Building2,
    color: "text-success-600",
    bg: "bg-success-50",
    border: "border-success-200",
  },
  certified_professional: {
    label: "Profesional certificado",
    description: "Certificado profesional verificado",
    icon: Award,
    color: "text-warning-600",
    bg: "bg-warning-50",
    border: "border-warning-200",
  },
  top_profile: {
    label: "Perfil destacado",
    description: "Perfil con completitud superior al 80%",
    icon: Star,
    color: "text-sun",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
};
