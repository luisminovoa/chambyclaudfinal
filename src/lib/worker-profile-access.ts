/**
 * Regla de autorización de "Ver perfil del trabajador", separada en una
 * función pura para poder probarla sin mockear Supabase. No puede vivir
 * dentro de src/lib/actions/workers.ts: un archivo "use server" solo puede
 * exportar funciones async (Server Actions) — Next.js rechaza el build si
 * exporta algo más, así que la lógica de decisión vive aquí y
 * getWorkerPublicProfile() solo la invoca con los datos ya resueltos.
 *
 * Regla (Fase 2 — acceso de empleador al directorio, sin relación previa):
 * el propio trabajador, un admin, un empleador con una relación de
 * postulación real sobre ese trabajador, O cualquier empleador autenticado
 * viendo el perfil profesional de un trabajador ACTIVO (el futuro
 * directorio, supabase/migrations/0037_public_workers_directory.sql,
 * necesita poder abrir un perfil sin que el trabajador haya postulado
 * antes a nada de ese empleador). Un trabajador inactivo, o cualquier
 * cuenta que no sea de rol worker, nunca queda expuesto por esta última
 * rama — workerIsActiveWorker ya codifica esa comprobación.
 *
 * IMPORTANTE: esta función solo decide SI se puede abrir el perfil, no
 * QUÉ columnas se devuelven. getWorkerPublicProfile() (src/lib/actions/
 * workers.ts) sigue proyectando explícitamente solo columnas seguras de
 * profiles/worker_profile_details sin importar por cuál rama de esta
 * regla se autorizó el acceso — nunca phone/whatsapp/birth_date/address/
 * district, sea cual sea el viewer.
 */
export interface CanViewWorkerProfileParams {
  viewerId: string;
  workerId: string;
  viewerIsAdmin: boolean;
  hasApplicationRelationship: boolean;
  /** true si el viewer autenticado está en modo activo "employer" (profiles.role). */
  viewerIsEmployer: boolean;
  /** true si el perfil solicitado es de un trabajador activo (role = 'worker' AND is_active). */
  workerIsActiveWorker: boolean;
}

export function canViewWorkerProfile({
  viewerId,
  workerId,
  viewerIsAdmin,
  hasApplicationRelationship,
  viewerIsEmployer,
  workerIsActiveWorker,
}: CanViewWorkerProfileParams): boolean {
  return (
    viewerId === workerId ||
    viewerIsAdmin ||
    hasApplicationRelationship ||
    (viewerIsEmployer && workerIsActiveWorker)
  );
}
