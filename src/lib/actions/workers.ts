"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { canViewWorkerProfile } from "@/lib/worker-profile-access";
import {
  escapePostgrestFilterValue,
  expandCategoryAliases,
  computeWorkerQualityScore,
} from "@/lib/worker-directory";
import type {
  ProfilePhoto,
  WorkerExperience,
  ProfileStats,
  RatingSummary,
  WorkerDiscoveryProfile,
  WorkerDiscoveryDetails,
  PublicWorkerListing,
  WorkerDirectoryFilters,
} from "@/lib/types";

export interface WorkerPublicProfile {
  profile: WorkerDiscoveryProfile;
  workerDetails: WorkerDiscoveryDetails | null;
  photos: ProfilePhoto[];
  experience: WorkerExperience[];
  stats: ProfileStats | null;
  ratingSummary: RatingSummary | null;
  jobsCompleted: number;
  /** Contexto de la postulación, solo si se pidió con jobId y existe. */
  application: { id: string; status: string } | null;
  jobId: string | null;
  /** Chat ya existente para ese job (se crea solo al aceptar), si lo hay. */
  conversationId: string | null;
  /** true solo si quien mira es el empleador dueño de jobId — nunca el propio worker ni un admin. */
  viewerIsEmployer: boolean;
}

/**
 * Perfil público de un trabajador, visible para:
 * - el propio trabajador
 * - un admin
 * - un empleador que tiene una postulación de este worker en alguno de sus jobs
 * - (Fase 2, directorio de trabajadores) cualquier empleador autenticado,
 *   si el trabajador solicitado está activo — canViewWorkerProfile()
 *   ya codifica esa condición vía workerIsActiveWorker
 *
 * No amplía ninguna policy RLS de profile_photos/worker_profile_details/
 * worker_experience/profile_stats (siguen siendo owner+admin-only) — la
 * autorización se verifica aquí, server-side, antes de usar el cliente
 * admin. Mismo patrón que getDocumentDownloadUrl() (src/lib/actions/
 * profile.ts): defense-in-depth acotado a la relación legítima, en vez
 * de una policy nueva de alcance amplio.
 *
 * IMPORTANTE (Fase 2): autorizar el acceso NO amplía qué columnas se
 * leen. profiles/worker_profile_details se proyectan con una lista
 * explícita de columnas seguras (WorkerDiscoveryProfile/
 * WorkerDiscoveryDetails, src/lib/types.ts — mismas columnas que
 * public.public_workers, 0037_public_workers_directory.sql) sin importar
 * por qué rama de canViewWorkerProfile() se autorizó — nunca phone,
 * nunca whatsapp/birth_date/address/district, para ningún viewer,
 * incluido un empleador con relación de postulación real. Antes de esta
 * fase el código hacía select("*") sobre ambas tablas confiando en que
 * WorkerPublicProfileView simplemente no renderizara esos campos — al
 * ampliar quién llega a este código (cualquier empleador, no solo con
 * relación), ese patrón dejaba de ser suficiente: la proyección explícita
 * hace que la ausencia de esos campos sea estructural, no solo una
 * omisión de la UI.
 *
 * Documentos de verificación (DNI, antecedentes) NO se exponen aquí —
 * solo el badge de verificación ya calculado (profile_stats.badges).
 * Ver docs/DISENO-MULTI-ROL.md y la auditoría del flujo de contratación:
 * mostrar el documento crudo a cualquier empleador es una decisión de
 * privacidad separada, no incluida en este alcance.
 */
export async function getWorkerPublicProfile(
  workerId: string,
  jobId?: string
): Promise<WorkerPublicProfile | null> {
  try {
    return await fetchWorkerPublicProfile(workerId, jobId);
  } catch (err) {
    // supabase-js puede lanzar (no solo devolver { error }) ante fallas de
    // red/timeout antes de llegar a Postgres — ver src/lib/format-supabase-error.ts,
    // mismo mecanismo que ya se documentó para profile.ts. Sin este catch,
    // esta página nunca debe mostrar el boundary de error genérico: se
    // trata como "no disponible" y cae al EmptyState, igual que cualquier
    // otro caso de no autorizado o no encontrado.
    console.error("[getWorkerPublicProfile] excepción no capturada:", err);
    return null;
  }
}

async function fetchWorkerPublicProfile(
  workerId: string,
  jobId?: string
): Promise<WorkerPublicProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const viewerRole = (viewerProfile as { role: string } | null)?.role;
  const isAdmin = viewerRole === "admin";
  const isEmployer = viewerRole === "employer";
  const isSelf = user.id === workerId;

  const admin = createAdminClient();

  let application: { id: string; status: string } | null = null;

  // ¿Este worker postuló a algún job del usuario actual? Se consulta siempre
  // que el viewer no sea el propio worker/admin, para que canViewWorkerProfile()
  // reciba el dato real en vez de asumir el resultado.
  if (!isSelf && !isAdmin) {
    const { data: appliedRow } = await supabase
      .from("job_applications")
      .select("id, status, job_id, jobs!inner(employer_id)")
      .eq("worker_id", workerId)
      .eq("jobs.employer_id", user.id)
      .limit(1)
      .maybeSingle();

    if (appliedRow) {
      application = { id: (appliedRow as { id: string }).id, status: (appliedRow as { status: string }).status };
    }
  }

  // Estado real del PERFIL SOLICITADO (no del viewer) — necesario para la
  // rama "empleador descubre a un trabajador activo" de
  // canViewWorkerProfile(). Cliente admin: la RLS de profiles (owner o
  // admin únicamente, post-CONTRACT) no dejaría a un empleador leer esto
  // directamente, y es exactamente el mismo tipo de comprobación puntual
  // ya usada en el resto de esta función. Nunca se devuelve al llamador —
  // solo alimenta esta decisión de autorización.
  const { data: targetRow } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", workerId)
    .maybeSingle();
  const workerIsActiveWorker =
    (targetRow as { role: string; is_active: boolean } | null)?.role === "worker" &&
    (targetRow as { role: string; is_active: boolean } | null)?.is_active === true;

  const authorized = canViewWorkerProfile({
    viewerId: user.id,
    workerId,
    viewerIsAdmin: isAdmin,
    hasApplicationRelationship: application !== null,
    viewerIsEmployer: isEmployer,
    workerIsActiveWorker,
  });

  if (!authorized) return null;

  const [profileRes, workerDetailsRes, photosRes, experienceRes, statsRes, ratingRes, completedRes] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, avatar_url, city, category, skills, bio, created_at, department, province, district")
        .eq("id", workerId)
        .single(),
      admin
        .from("worker_profile_details")
        .select("professional_title, availability, years_experience, hourly_rate, daily_rate, languages")
        .eq("profile_id", workerId)
        .maybeSingle(),
      admin
        .from("profile_photos")
        .select("*")
        .eq("profile_id", workerId)
        .order("is_primary", { ascending: false })
        .order("display_order", { ascending: true }),
      admin
        .from("worker_experience")
        .select("*")
        .eq("profile_id", workerId)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false }),
      admin.from("profile_stats").select("*").eq("profile_id", workerId).maybeSingle(),
      supabase.from("rating_summary").select("*").eq("profile_id", workerId).maybeSingle(),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .eq("status", "completado"),
    ]);

  if (!profileRes.data) return null;

  // Si se pidió con jobId explícito, resuelve la postulación de ESE job
  // (puede diferir de la encontrada arriba, que solo prueba "algún job").
  let viewerIsEmployer = false;
  if (jobId) {
    if (isSelf || isAdmin) {
      const { data } = await supabase
        .from("job_applications")
        .select("id, status")
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .maybeSingle();
      application = (data as { id: string; status: string } | null) ?? null;
    } else {
      const { data } = await supabase
        .from("job_applications")
        .select("id, status, jobs!inner(employer_id)")
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .eq("jobs.employer_id", user.id)
        .maybeSingle();
      application = data
        ? { id: (data as { id: string }).id, status: (data as { status: string }).status }
        : null;
      viewerIsEmployer = Boolean(application);
    }
  }

  // Si ya existe un chat para este job (se crea al aceptar la
  // postulación — handle_application_accepted(), 0002_hiring_tracking.sql),
  // lo enlazamos directo. No se crea ningún chat nuevo aquí — abrir
  // conversación antes de aceptar es una decisión de negocio aparte,
  // fuera de este alcance.
  let conversationId: string | null = null;
  if (jobId && application) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();
    conversationId = (conv as { id: string } | null)?.id ?? null;
  }

  return {
    profile: profileRes.data as WorkerDiscoveryProfile,
    workerDetails: (workerDetailsRes.data as WorkerDiscoveryDetails | null) ?? null,
    photos: (photosRes.data as ProfilePhoto[]) ?? [],
    experience: (experienceRes.data as WorkerExperience[]) ?? [],
    stats: (statsRes.data as ProfileStats | null) ?? null,
    ratingSummary: (ratingRes.data as unknown as RatingSummary | null) ?? null,
    jobsCompleted: completedRes.count ?? 0,
    application,
    jobId: jobId ?? null,
    conversationId,
    viewerIsEmployer,
  };
}

/**
 * Directorio de trabajadores (Fase 3) — lista pública de trabajadores
 * activos para que un empleador descubra a quién contratar sin necesitar
 * una postulación previa (canViewWorkerProfile(), Fase 2). Fuente única:
 * public.public_workers (0037_public_workers_directory.sql) — ya filtra
 * role='worker' AND is_active y ya excluye phone/whatsapp/birth_date/
 * address/district estructuralmente (esas columnas no existen en la
 * vista). Esta función nunca hace select("*") ni usa createAdminClient():
 * public_workers solo otorga SELECT a `authenticated` (0037), así que el
 * cliente de sesión es exactamente el rol correcto — un listado público
 * no necesita ni debe bypassear RLS con service_role.
 *
 * Sin sesión, devuelve [] antes de tocar la base: anon no tiene SELECT
 * sobre public_workers (0037), así que ni siquiera vale la pena intentar
 * la consulta — mismo principio que el resto de este archivo (nunca
 * asumir autorización, siempre partir de "no autenticado = sin acceso").
 *
 * rating_summary se resuelve aparte (ya pública desde 0001_init.sql, no
 * vive en public_workers) — mismo patrón de join en aplicación ya usado
 * en fetchWorkerPublicProfile() de esta misma función y en Home
 * (src/app/page.tsx) para el empleador de cada job.
 */
// Fase C4-G1 (corrige P1/G1 de la auditoría C4-G): antes había un único
// límite (60) aplicado en SQL por created_at DESC, ANTES de calcular
// computeWorkerQualityScore() — el ranking solo podía reordenar lo que ese
// corte ya había decidido incluir, así que un perfil de alta calidad pero
// con created_at antiguo podía quedar excluido sin que el ranking llegara
// siquiera a evaluarlo. Separar los dos límites resuelve eso sin tocar
// public_workers, sin RPC ni migración: CANDIDATE_POOL_LIMIT acota cuánto
// trae la consulta SQL (deliberadamente muy por encima de cualquier tamaño
// conocido o previsible de Production — ver auditoría C4-G1), y
// DISPLAY_LIMIT preserva exactamente el tamaño de resultado visible de
// siempre (60), aplicado DESPUÉS de rankear en memoria.
const CANDIDATE_POOL_LIMIT = 500;
const DISPLAY_LIMIT = 60;

export async function listPublicWorkers(
  filters: WorkerDirectoryFilters
): Promise<PublicWorkerListing[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from("public_workers")
      .select(
        "id, full_name, avatar_url, city, category, skills, bio, created_at, professional_title, availability, years_experience, hourly_rate, daily_rate, department, province, district"
      );

    // .in() con los alias conocidos de la categoría (p.ej. "Gasfitero" ->
    // ["Gasfitero", "Plomero"]) — ver expandCategoryAliases() para el
    // porqué: el catálogo del Home y el de InfoTab.tsx no coinciden para
    // varias categorías. Sigue siendo un filtro estructurado (conjunto
    // exacto de valores), no una búsqueda difusa — eso es responsabilidad
    // de `q`, no de `category`.
    if (filters.category) query = query.in("category", expandCategoryAliases(filters.category));
    if (filters.city) query = query.ilike("city", `%${filters.city}%`);
    if (filters.availability) query = query.eq("availability", filters.availability);
    // Ubicación jerárquica (Fase 6, C4-G18): .eq() exacto, nunca ilike —
    // a diferencia de `city` (fallback legacy de texto libre), estos
    // valores vienen del catálogo cerrado de ubigeo.ts, así que una
    // coincidencia exacta es la comparación correcta. Convive con `city`
    // sin ningún OR heurístico entre ambos: son dos filtros independientes
    // que el caller puede combinar o no.
    if (filters.department) query = query.eq("department", filters.department);
    if (filters.province) query = query.eq("province", filters.province);
    if (filters.district) query = query.eq("district", filters.district);
    if (filters.q) {
      // El valor completo (incl. los comodines % de ILIKE) se escapa y se
      // envuelve entre comillas dobles para que PostgREST lo trate como
      // UN solo valor — sin esto, una coma o un paréntesis en filters.q
      // (p.ej. "Juan, electricista") se interpreta como el separador
      // entre condiciones del propio .or() y rompe/altera el filtro. Ver
      // escapePostgrestFilterValue() para el detalle de la sintaxis.
      const q = escapePostgrestFilterValue(`%${filters.q}%`);
      query = query.or(
        `full_name.ilike.${q},professional_title.ilike.${q},category.ilike.${q},city.ilike.${q}`
      );
    }

    const { data: workers } = await query
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_POOL_LIMIT);
    const rows = (workers as unknown as Omit<PublicWorkerListing, "ratingSummary" | "jobsCompleted">[]) ?? [];
    if (rows.length === 0) return [];

    // Fase C5 (incorporar rating/jobsCompleted al ranking): ambas señales
    // deben conocerse ANTES de ordenar/recortar, porque de lo contrario un
    // worker con excelente historial pero perfil menos "completo" nunca
    // llegaría a competir por los DISPLAY_LIMIT puestos visibles — el
    // ranking solo podría reordenar entre quienes ya habían sido elegidos
    // sin esa señal. Por eso ambas consultas (ya existentes, ya batched en
    // una sola llamada `.in()` cada una — nunca N+1) se ejecutan aquí,
    // sobre el pool COMPLETO de candidatos (hasta CANDIDATE_POOL_LIMIT
    // ids), y no solo sobre los DISPLAY_LIMIT finales como en la Fase
    // C3/C4-G3 original. Sigue siendo una sola llamada por tabla; el
    // tamaño de la lista de ids crece, pero eso no es N+1.
    const allIds = rows.map((r) => r.id);

    const { data: ratings } = await supabase
      .from("rating_summary")
      .select("*")
      .in("profile_id", allIds);
    const ratingById = new Map(
      ((ratings as unknown as RatingSummary[]) ?? []).map((r) => [r.profile_id, r])
    );

    // jobsCompleted (Fase C4-G3, ahora también insumo del ranking en Fase
    // C5): UNA sola consulta batched sobre TODO el pool de candidatos,
    // agregada en memoria — no hay `GROUP BY` per-worker vía PostgREST sin
    // una vista/RPC nueva, así que se trae una fila por job completado y
    // se cuenta por `assigned_worker_id`. Cliente de sesión, sin RLS
    // especial (mismo patrón ya usado por getWorkerPublicProfile() para un
    // solo worker, aquí extendido a un lote).
    const { data: completedJobs } = await supabase
      .from("jobs")
      .select("assigned_worker_id")
      .in("assigned_worker_id", allIds)
      .eq("status", "completado");
    const jobsCompletedById = new Map<string, number>();
    for (const job of (completedJobs as { assigned_worker_id: string }[] | null) ?? []) {
      jobsCompletedById.set(
        job.assigned_worker_id,
        (jobsCompletedById.get(job.assigned_worker_id) ?? 0) + 1
      );
    }

    // Ranking de "preparación del perfil + calidad demostrada" (Fase C3 +
    // C5) — se aplica DESPUÉS de los filtros de arriba (category/city/
    // availability/q ya redujeron el conjunto), reordenando en memoria las
    // filas ya obtenidas. Nunca excluye a nadie dentro del pool de
    // candidatos, solo cambia el orden. Empate → created_at DESC (mismo
    // criterio que ya usaba la consulta, ahora como desempate explícito en
    // vez de único criterio de orden).
    const ranked = [...rows].sort((a, b) => {
      const scoreA = computeWorkerQualityScore({
        ...a,
        ratingSummary: ratingById.get(a.id) ?? null,
        jobsCompleted: jobsCompletedById.get(a.id) ?? 0,
      });
      const scoreB = computeWorkerQualityScore({
        ...b,
        ratingSummary: ratingById.get(b.id) ?? null,
        jobsCompleted: jobsCompletedById.get(b.id) ?? 0,
      });
      const scoreDiff = scoreB - scoreA;
      if (scoreDiff !== 0) return scoreDiff;
      return b.created_at.localeCompare(a.created_at);
    });

    // El corte a lo que realmente se devuelve sigue ocurriendo AQUÍ,
    // después de rankear todo el pool de candidatos — no en la consulta
    // SQL (Fase C4-G1, sin cambios). rating_summary/jobs ya se consultaron
    // arriba para todo el pool; aquí solo se reutilizan los mismos Map, sin
    // ninguna consulta adicional.
    const visibleWorkers = ranked.slice(0, DISPLAY_LIMIT);

    return visibleWorkers.map((r) => ({
      ...r,
      ratingSummary: ratingById.get(r.id) ?? null,
      jobsCompleted: jobsCompletedById.get(r.id) ?? 0,
    }));
  } catch (err) {
    // Mismo mecanismo que getWorkerPublicProfile(): supabase-js puede
    // lanzar ante fallas de red/timeout — la página trata esto como
    // "sin resultados", nunca como un error genérico.
    console.error("[listPublicWorkers] excepción no capturada:", err);
    return [];
  }
}
