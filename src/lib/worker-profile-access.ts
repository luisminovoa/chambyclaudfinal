/**
 * Regla de autorización de "Ver perfil del postulante", separada en una
 * función pura para poder probarla sin mockear Supabase. No puede vivir
 * dentro de src/lib/actions/workers.ts: un archivo "use server" solo puede
 * exportar funciones async (Server Actions) — Next.js rechaza el build si
 * exporta algo más, así que la lógica de decisión vive aquí y
 * getWorkerPublicProfile() solo la invoca con los datos ya resueltos.
 *
 * Regla: el propio trabajador, un admin, o un empleador con una relación
 * de postulación real sobre ese trabajador.
 */
export interface CanViewWorkerProfileParams {
  viewerId: string;
  workerId: string;
  viewerIsAdmin: boolean;
  hasApplicationRelationship: boolean;
}

export function canViewWorkerProfile({
  viewerId,
  workerId,
  viewerIsAdmin,
  hasApplicationRelationship,
}: CanViewWorkerProfileParams): boolean {
  return viewerId === workerId || viewerIsAdmin || hasApplicationRelationship;
}
