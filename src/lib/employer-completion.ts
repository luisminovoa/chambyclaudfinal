import type { CompletionItem } from "@/lib/profile-completion";
import type { Profile, ProfilePhoto, VerificationDocument } from "@/lib/types";

/**
 * Desglose de completitud para el perfil de EMPLEADOR — paralelo a
 * getProfileCompletionItems() (src/lib/profile-completion.ts), que es
 * específico de worker (skills, categoría, worker_profile_details,
 * experiencia no aplican aquí). Refleja los mismos criterios y pesos que
 * la rama `role === "employer"` de computeAndSaveProfileStats()
 * (src/lib/actions/profile.ts) — esa Server Action es la fuente de
 * verdad que persiste profile_stats.completion_percentage; esta función
 * es solo para mostrar el desglose en UI. Si cambian los pesos en un
 * lado, deben cambiar en el otro.
 */
export function getEmployerCompletionItems(
  profile: Profile,
  photos: ProfilePhoto[],
  documents: VerificationDocument[]
): CompletionItem[] {
  const hasPrimaryPhoto = photos.some((p) => p.is_primary);
  const hasBusinessName = !!profile.business_name;
  const hasBusinessSector = !!profile.business_sector;
  const hasEmployerType = !!profile.employer_type;
  const hasDescription = !!(profile.business_description || profile.bio);
  const hasCity = !!profile.city;
  const hasDistrict = !!profile.district;
  const hasDni = documents.some(
    (d) => d.document_type === "dni" && d.status === "verified"
  );
  const hasRuc = documents.some(
    (d) => d.document_type === "ruc" && d.status === "verified"
  );
  const hasCert = documents.some(
    (d) => d.document_type === "certificado" && d.status === "verified"
  );

  return [
    { label: "Foto o logo", points: 15, done: hasPrimaryPhoto },
    { label: "Nombre comercial", points: 15, done: hasBusinessName },
    { label: "Descripción", points: 15, done: hasDescription },
    { label: "Rubro/sector", points: 10, done: hasBusinessSector },
    { label: "Tipo de empleador (persona/empresa)", points: 10, done: hasEmployerType },
    { label: "Ciudad", points: 5, done: hasCity },
    { label: "Distrito", points: 5, done: hasDistrict },
    { label: "DNI verificado", points: 10, done: hasDni },
    { label: "RUC verificado", points: 10, done: hasRuc },
    { label: "Certificado verificado", points: 5, done: hasCert },
  ];
}
