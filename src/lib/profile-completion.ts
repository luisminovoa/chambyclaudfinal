import type {
  Profile,
  ProfilePhoto,
  VerificationDocument,
  WorkerProfileDetails,
  WorkerExperience,
} from "@/lib/types";

export interface CompletionItem {
  label: string;
  points: number;
  done: boolean;
}

/**
 * Puesto principal a mostrar en el header del perfil y en la tarjeta "Mi
 * perfil" del dashboard — única fuente para ambos, evita que uno muestre
 * professional_title y el otro se quede en profile.category. profile.category
 * solo se usa como fallback (perfiles creados antes de este campo, o
 * mientras professional_title está vacío); nunca se prioriza sobre él.
 */
export function getWorkerPrimaryTitle(
  profile: Profile,
  workerDetails: WorkerProfileDetails | null
): string {
  return workerDetails?.professional_title || profile.category || "Sin especialidad";
}

/**
 * Desglose de completitud para mostrar en ProfileCompletionBar. Refleja
 * los mismos criterios y pesos que computeAndSaveProfileStats()
 * (src/lib/actions/profile.ts) — ese Server Action es la fuente de
 * verdad que persiste profile_stats.completion_percentage; esta función
 * es solo para mostrar el desglose en UI (VerificationTab y la tarjeta
 * "Mi perfil" del dashboard), sin recalcular ni volver a escribir nada.
 * Si cambian los pesos en un lado, deben cambiar en el otro.
 */
export function getProfileCompletionItems(
  profile: Profile,
  workerDetails: WorkerProfileDetails | null,
  photos: ProfilePhoto[],
  documents: VerificationDocument[],
  experience: WorkerExperience[]
): CompletionItem[] {
  const hasPrimary = photos.some((p) => p.is_primary);
  const has5Photos = photos.length >= 5;
  const hasBio = !!profile.bio;
  const hasCategory = !!profile.category;
  const hasSkills = (profile.skills ?? []).length >= 3;
  const hasDni = documents.some(
    (d) => d.document_type === "dni" && d.status === "verified"
  );
  const hasRuc = documents.some(
    (d) => d.document_type === "ruc" && d.status === "verified"
  );
  const hasCert = documents.some(
    (d) => d.document_type === "certificado" && d.status === "verified"
  );
  const hasAntec = documents.some(
    (d) =>
      (d.document_type === "antecedentes_policiales" ||
        d.document_type === "antecedentes_penales") &&
      d.status === "verified"
  );
  const hasExtendedInfo =
    !!workerDetails?.professional_title &&
    workerDetails.years_experience != null &&
    (workerDetails.hourly_rate != null || workerDetails.daily_rate != null);
  const hasExperience = experience.length >= 1;

  return [
    { label: "Foto principal", points: 10, done: hasPrimary },
    { label: "5 o más fotos", points: 10, done: has5Photos },
    { label: "Descripción (bio)", points: 10, done: hasBio },
    { label: "Especialidad", points: 10, done: hasCategory },
    { label: "3+ habilidades", points: 10, done: hasSkills },
    { label: "Información profesional completa", points: 10, done: hasExtendedInfo },
    { label: "Experiencia laboral registrada", points: 10, done: hasExperience },
    { label: "DNI verificado", points: 10, done: hasDni },
    { label: "RUC verificado", points: 10, done: hasRuc },
    { label: "Certificado verificado", points: 5, done: hasCert },
    { label: "Antecedentes verificados", points: 5, done: hasAntec },
  ];
}
