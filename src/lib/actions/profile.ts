"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { formatSupabaseError, formatUnknownError } from "@/lib/format-supabase-error";
import type {
  ProfilePhoto,
  VerificationDocument,
  DocumentType,
  ProfileStats,
  WorkerProfileDetails,
  AvailabilityStatus,
  WorkerExperience,
  EmployerType,
} from "@/lib/types";

const AVAILABILITY_VALUES: AvailabilityStatus[] = [
  "inmediata",
  "una_semana",
  "un_mes",
  "no_disponible",
];

const EMPLOYER_TYPE_VALUES: EmployerType[] = ["individual", "company"];
const RUC_PATTERN = /^\d{11}$/;

type Ok = { success: true };
type Err = { error: string };
type ActionResult = Ok | Err;

async function getAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── Profile info ──────────────────────────────────────────────────────────────

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const bio = (formData.get("bio") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const city = (formData.get("city") as string) || null;
  const category = (formData.get("category") as string) || null;
  const skillsRaw = formData.get("skills") as string | null;
  const skills = skillsRaw
    ? skillsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const updates: Record<string, unknown> = { bio, phone, city, category, skills };

  // full_name es opcional en el FormData a propósito: InfoTab.tsx (worker)
  // no lo envía, así que `formData.get()` devuelve null y no se toca la
  // columna — evitar que un caller que no edita el nombre lo vacíe sin
  // querer. EmployerInfoTab.tsx sí lo envía siempre.
  const fullNameRaw = formData.get("full_name") as string | null;
  if (fullNameRaw !== null) {
    const fullName = fullNameRaw.trim();
    if (!fullName) return { error: "El nombre no puede estar vacío." };
    if (fullName.length > 120) return { error: "El nombre es demasiado largo." };
    updates.full_name = fullName;
  }

  // Identidad empresarial (0030) — mismo criterio de "opcional en el
  // FormData" que full_name: solo EmployerInfoTab.tsx los envía, así que
  // InfoTab.tsx (worker) nunca los toca. `district` es la excepción: se
  // trata como el resto de campos de "Información básica" (bio/phone/
  // city), siempre presente en el FormData de quien lo envía.
  const districtRaw = formData.get("district") as string | null;
  if (districtRaw !== null) {
    updates.district = districtRaw.trim() || null;
  }

  const employerTypeRaw = formData.get("employer_type") as string | null;
  if (employerTypeRaw !== null) {
    if (employerTypeRaw === "") {
      updates.employer_type = null;
    } else if (!EMPLOYER_TYPE_VALUES.includes(employerTypeRaw as EmployerType)) {
      return { error: "Tipo de empleador inválido." };
    } else {
      updates.employer_type = employerTypeRaw;
    }
  }

  const businessNameRaw = formData.get("business_name") as string | null;
  if (businessNameRaw !== null) {
    const businessName = businessNameRaw.trim();
    if (businessName.length > 150) {
      return { error: "El nombre comercial es demasiado largo." };
    }
    updates.business_name = businessName || null;
  }

  const businessSectorRaw = formData.get("business_sector") as string | null;
  if (businessSectorRaw !== null) {
    const businessSector = businessSectorRaw.trim();
    if (businessSector.length > 100) {
      return { error: "El rubro/sector es demasiado largo." };
    }
    updates.business_sector = businessSector || null;
  }

  const businessDescriptionRaw = formData.get("business_description") as string | null;
  if (businessDescriptionRaw !== null) {
    const businessDescription = businessDescriptionRaw.trim();
    if (businessDescription.length > 1000) {
      return { error: "La descripción empresarial es demasiado larga." };
    }
    updates.business_description = businessDescription || null;
  }

  // business_ruc es SOLO el RUC declarado por el propio empleador — nunca
  // otorga el badge ruc_active (eso depende exclusivamente de
  // verification_documents con document_type='ruc' y status='verified',
  // ver computeAndSaveProfileStats()). Se valida el formato (11 dígitos,
  // estándar peruano) para evitar basura evidente, no su autenticidad.
  const businessRucRaw = formData.get("business_ruc") as string | null;
  if (businessRucRaw !== null) {
    const businessRuc = businessRucRaw.trim();
    if (businessRuc && !RUC_PATTERN.test(businessRuc)) {
      return { error: "El RUC debe tener 11 dígitos." };
    }
    updates.business_ruc = businessRuc || null;
  }

  try {
    const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);

    if (error) return { error: formatSupabaseError(error, "updateProfile") };
  } catch (err) {
    return { error: formatUnknownError(err, "updateProfile") };
  }

  // Layout completo: este perfil puede mostrarse en el dashboard de
  // worker, el de employer, y las páginas públicas /workers/[id] y
  // /employers/[id] — revalidar solo rutas de worker (como antes)
  // dejaba desactualizado el dashboard de employer tras guardar.
  revalidatePath("/", "layout");
  return { success: true };
}

// ── Profile photos ────────────────────────────────────────────────────────────

export async function getProfilePhotos(): Promise<ProfilePhoto[]> {
  const { supabase, user } = await getAuth();
  if (!user) return [];

  const { data } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("profile_id", user.id)
    .order("display_order", { ascending: true });

  return (data as ProfilePhoto[]) ?? [];
}

export async function createPhotoUploadUrl(fileName: string): Promise<
  ActionResult & { uploadUrl?: string; publicUrl?: string; storagePath?: string }
> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((count ?? 0) >= 10) return { error: "Límite de 10 fotos alcanzado." };

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = `${Date.now()}.${ext}`;
  const storagePath = `${user.id}/${safeName}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("profile-images")
    .createSignedUploadUrl(storagePath);

  if (error || !data) return { error: "No se pudo preparar la subida." };

  const {
    data: { publicUrl },
  } = admin.storage.from("profile-images").getPublicUrl(storagePath);

  return { success: true, uploadUrl: data.signedUrl, publicUrl, storagePath };
}

export async function saveProfilePhoto(params: {
  storagePath: string;
  publicUrl: string;
  isPrimary: boolean;
}): Promise<ActionResult & { photo?: ProfilePhoto }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  // storagePath debe estar dentro de la propia carpeta del usuario —
  // sin esto, un llamante que se salte createPhotoUploadUrl() podría
  // registrar una fila propia apuntando al archivo de otro usuario y
  // luego borrarlo vía deleteProfilePhoto() (cliente admin de Storage).
  if (!params.storagePath.startsWith(`${user.id}/`)) {
    return { error: "Ruta de archivo inválida." };
  }

  const { data: existing } = await supabase
    .from("profile_photos")
    .select("display_order")
    .eq("profile_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1);

  const nextOrder =
    ((existing?.[0] as { display_order: number } | undefined)?.display_order ??
      -1) + 1;

  if (params.isPrimary) {
    await supabase
      .from("profile_photos")
      .update({ is_primary: false })
      .eq("profile_id", user.id);
  }

  const { data, error } = await supabase
    .from("profile_photos")
    .insert({
      profile_id: user.id,
      storage_path: params.storagePath,
      public_url: params.publicUrl,
      is_primary: params.isPrimary,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) return { error: formatSupabaseError(error, "saveProfilePhoto") };

  if (params.isPrimary) {
    await supabase
      .from("profiles")
      .update({ avatar_url: params.publicUrl })
      .eq("id", user.id);
  }

  revalidatePath("/", "layout");
  return { success: true, photo: data as ProfilePhoto };
}

export async function deleteProfilePhoto(photoId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { data: photo, error: fetchErr } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("id", photoId)
    .eq("profile_id", user.id)
    .single();

  if (fetchErr || !photo) return { error: "Foto no encontrada." };

  const p = photo as ProfilePhoto;
  const admin = createAdminClient();
  await admin.storage.from("profile-images").remove([p.storage_path]);

  const { error } = await supabase
    .from("profile_photos")
    .delete()
    .eq("id", photoId);

  if (error) return { error: formatSupabaseError(error, "deleteProfilePhoto") };

  if (p.is_primary) {
    await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setPrimaryPhoto(photoId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { data: photo } = await supabase
    .from("profile_photos")
    .select("public_url")
    .eq("id", photoId)
    .eq("profile_id", user.id)
    .single();

  if (!photo) return { error: "Foto no encontrada." };

  await supabase
    .from("profile_photos")
    .update({ is_primary: false })
    .eq("profile_id", user.id);

  const { error } = await supabase
    .from("profile_photos")
    .update({ is_primary: true })
    .eq("id", photoId);

  if (error) return { error: formatSupabaseError(error, "setPrimaryPhoto") };

  await supabase
    .from("profiles")
    .update({ avatar_url: (photo as { public_url: string }).public_url })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function reorderPhotos(orderedIds: string[]): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("profile_photos")
        .update({ display_order: index })
        .eq("id", id)
        .eq("profile_id", user.id)
    )
  );

  revalidatePath("/dashboard/worker/profile");
  return { success: true };
}

// ── Verification documents ────────────────────────────────────────────────────

export async function getVerificationDocuments(): Promise<VerificationDocument[]> {
  const { supabase, user } = await getAuth();
  if (!user) return [];

  const { data } = await supabase
    .from("verification_documents")
    .select("*")
    .eq("profile_id", user.id)
    .order("uploaded_at", { ascending: false });

  return (data as VerificationDocument[]) ?? [];
}

export async function createDocumentUploadUrl(
  fileName: string,
  contentType: string
): Promise<ActionResult & { uploadUrl?: string; storagePath?: string }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!ALLOWED.includes(contentType)) {
    return { error: "Solo se permiten imágenes (JPG, PNG, WebP) o PDF." };
  }

  const ext =
    contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
  const safeName = `${Date.now()}.${ext}`;
  const storagePath = `${user.id}/${safeName}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("verification-documents")
    .createSignedUploadUrl(storagePath);

  if (error || !data) return { error: "No se pudo preparar la subida." };

  return { success: true, uploadUrl: data.signedUrl, storagePath };
}

export async function saveVerificationDocument(params: {
  storagePath: string;
  documentType: DocumentType;
  fileName: string;
}): Promise<ActionResult & { document?: VerificationDocument }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  // Mismo resguardo que saveProfilePhoto(): storagePath debe estar
  // dentro de la propia carpeta del usuario.
  if (!params.storagePath.startsWith(`${user.id}/`)) {
    return { error: "Ruta de archivo inválida." };
  }

  const { data, error } = await supabase
    .from("verification_documents")
    .insert({
      profile_id: user.id,
      document_type: params.documentType,
      storage_path: params.storagePath,
      file_name: params.fileName,
    })
    .select()
    .single();

  if (error) return { error: formatSupabaseError(error, "saveVerificationDocument") };

  // Esta acción ahora también la usa el empleador (verificación de RUC/DNI
  // en /dashboard/employer/profile) — mismo ajuste que
  // computeAndSaveProfileStats(), no acotar la revalidación a la ruta de
  // worker.
  revalidatePath("/", "layout");
  return { success: true, document: data as VerificationDocument };
}

export async function deleteVerificationDocument(
  documentId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { data: doc } = await supabase
    .from("verification_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("profile_id", user.id)
    .single();

  if (!doc) return { error: "Documento no encontrado." };

  const admin = createAdminClient();
  await admin.storage
    .from("verification-documents")
    .remove([(doc as { storage_path: string }).storage_path]);

  const { error } = await supabase
    .from("verification_documents")
    .delete()
    .eq("id", documentId);

  if (error) return { error: formatSupabaseError(error, "deleteVerificationDocument") };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getDocumentDownloadUrl(
  documentId: string
): Promise<string | null> {
  const { supabase, user } = await getAuth();
  if (!user) return null;

  const { data: doc } = await supabase
    .from("verification_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("profile_id", user.id)
    .single();

  if (!doc) return null;

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("verification-documents")
    .createSignedUrl((doc as { storage_path: string }).storage_path, 3600);

  return data?.signedUrl ?? null;
}

// ── Profile stats ─────────────────────────────────────────────────────────────

/**
 * Recalcula completion_percentage/trust_score/badges. Sin argumento,
 * calcula para el usuario autenticado (comportamiento original, sin
 * cambios). Con `targetProfileId` distinto del caller, exige que el
 * caller sea admin — usado por reviewVerificationDocument()
 * (src/lib/actions/admin.ts) para recalcular badges del trabajador
 * dueño del documento justo después de aprobar/rechazar, en vez de
 * duplicar este cálculo. Como es un Server Action exportado (invocable
 * directamente, no solo desde la UI que lo dispara), el chequeo de rol
 * es obligatorio aquí adentro — no alcanza con que solo lo llame código
 * ya admin-gated.
 */
export async function computeAndSaveProfileStats(
  targetProfileId?: string
): Promise<ActionResult & { stats?: ProfileStats }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  let profileId = user.id;
  let db = supabase;

  if (targetProfileId && targetProfileId !== user.id) {
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if ((callerProfile as { role: string } | null)?.role !== "admin") {
      return { error: "No autorizado." };
    }
    profileId = targetProfileId;
    db = createAdminClient();
  }

  const [profileRes, photosRes, docsRes, detailsRes, experienceRes] = await Promise.all([
    db
      .from("profiles")
      .select(
        "role,bio,category,skills,city,district,employer_type,business_name,business_sector,business_description"
      )
      .eq("id", profileId)
      .single(),
    db.from("profile_photos").select("is_primary").eq("profile_id", profileId),
    db.from("verification_documents").select("document_type,status").eq("profile_id", profileId),
    db
      .from("worker_profile_details")
      .select("professional_title,years_experience,hourly_rate,daily_rate")
      .eq("profile_id", profileId)
      .maybeSingle(),
    db
      .from("worker_experience")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId),
  ]);

  const profile = profileRes.data as {
    role: "worker" | "employer" | "admin";
    bio: string | null;
    category: string | null;
    skills: string[];
    city: string | null;
    district: string | null;
    employer_type: string | null;
    business_name: string | null;
    business_sector: string | null;
    business_description: string | null;
  } | null;
  const photos = (photosRes.data ?? []) as { is_primary: boolean }[];
  const docs = (docsRes.data ?? []) as {
    document_type: DocumentType;
    status: string;
  }[];
  const details = detailsRes.data as {
    professional_title: string | null;
    years_experience: number | null;
    hourly_rate: number | null;
    daily_rate: number | null;
  } | null;

  let score = 0;
  const badges: string[] = [];
  const hasPrimaryPhoto = photos.some((p) => p.is_primary);

  // Los pesos de completitud difieren por rol: los criterios de worker
  // (skills, categoría laboral, worker_profile_details, experiencia) no
  // aplican a un employer y lo dejaban artificialmente bajo aunque su
  // perfil estuviera completo para lo que a él le corresponde. Las
  // insignias por documento verificado (identity_verified/ruc_active/
  // certified_professional) son las mismas para ambos roles — no se
  // duplica esa lógica, solo el peso que suman al score de completitud.
  if (profile?.role === "employer") {
    // Foto/logo = 15%
    if (hasPrimaryPhoto) score += 15;
    // Nombre comercial = 15%
    if (profile.business_name) score += 15;
    // Rubro/sector = 10%
    if (profile.business_sector) score += 10;
    // Tipo de empleador = 10%
    if (profile.employer_type) score += 10;
    // Descripción (empresarial, o general como respaldo) = 15%
    if (profile.business_description || profile.bio) score += 15;
    // Ciudad = 5%
    if (profile.city) score += 5;
    // Distrito = 5%
    if (profile.district) score += 5;
  } else {
    // Foto principal = 10%
    if (hasPrimaryPhoto) score += 10;

    // 5 fotos = 10%
    if (photos.length >= 5) score += 10;

    // Descripción = 10%
    if (profile?.bio) score += 10;

    // Especialidad = 10%
    if (profile?.category) score += 10;

    // Habilidades / Experiencia = 10% (3+ skills)
    if ((profile?.skills ?? []).length >= 3) score += 10;

    // Información profesional ampliada = 10% (título + años de experiencia
    // + al menos una tarifa cargada)
    const hasExtendedInfo =
      !!details?.professional_title &&
      details.years_experience != null &&
      (details.hourly_rate != null || details.daily_rate != null);
    if (hasExtendedInfo) score += 10;

    // Experiencia laboral registrada = 10% (al menos 1 experiencia)
    if ((experienceRes.count ?? 0) >= 1) score += 10;
  }

  // DNI verificado = 10%
  const dniOk = docs.some(
    (d) => d.document_type === "dni" && d.status === "verified"
  );
  if (dniOk) {
    score += 10;
    badges.push("identity_verified");
  }

  // RUC verificado = 10%
  const rucOk = docs.some(
    (d) => d.document_type === "ruc" && d.status === "verified"
  );
  if (rucOk) {
    score += 10;
    badges.push("ruc_active");
  }

  // Certificado verificado = 5%
  const certOk = docs.some(
    (d) => d.document_type === "certificado" && d.status === "verified"
  );
  if (certOk) {
    score += 5;
    badges.push("certified_professional");
  }

  // Antecedentes verificados = 5% (worker; no forma parte de la
  // completitud de employer, ver rama de arriba)
  if (profile?.role !== "employer") {
    const antecOk = docs.some(
      (d) =>
        (d.document_type === "antecedentes_policiales" ||
          d.document_type === "antecedentes_penales") &&
        d.status === "verified"
    );
    if (antecOk) score += 5;
  }

  // Insignia Perfil Destacado
  if (score >= 80) badges.push("top_profile");

  const trust_score = Math.min(100, score + badges.length * 3);

  // profile_stats ya no acepta INSERT/UPDATE directo de `authenticated`
  // (0013_harden_profile_module_rls.sql) — badges como "identity_verified"
  // representan una verificación calculada por este mismo cálculo, no
  // algo que el usuario deba poder escribir directamente. Se usa el
  // cliente admin únicamente para este upsert; el resto de la función
  // sigue leyendo con `db` (normal para el propio usuario, admin cuando
  // targetProfileId pertenece a otro perfil), ya acotado por profileId.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_stats")
    .upsert({
      profile_id: profileId,
      completion_percentage: score,
      trust_score,
      badges,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { error: formatSupabaseError(error, "computeAndSaveProfileStats") };

  // Mismo bug que updateProfile()/saveProfilePhoto() tenían antes de
  // corregirse: este cálculo corre tanto para worker (propio perfil o
  // admin recalculando tras revisar un documento) como para employer —
  // revalidar solo "/dashboard/worker/profile" dejaba el dashboard/perfil
  // público de un employer con badges/trust_score desactualizados tras
  // aprobarse su DNI o RUC. Se usa el mismo patrón ya establecido para
  // fotos: invalidar todo el layout en vez de una ruta fija de un solo rol.
  revalidatePath("/", "layout");
  return { success: true, stats: data as ProfileStats };
}

export async function getProfileStats(): Promise<ProfileStats | null> {
  const { supabase, user } = await getAuth();
  if (!user) return null;

  const { data } = await supabase
    .from("profile_stats")
    .select("*")
    .eq("profile_id", user.id)
    .single();

  return (data as ProfileStats) ?? null;
}

// ── Worker profile details (Fase 1) ───────────────────────────────────────────

export async function getWorkerProfileDetails(): Promise<WorkerProfileDetails | null> {
  const { supabase, user } = await getAuth();
  if (!user) return null;

  const { data } = await supabase
    .from("worker_profile_details")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (data as WorkerProfileDetails) ?? null;
}

export async function upsertWorkerProfileDetails(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const professional_title = (formData.get("professional_title") as string)?.trim() || null;
  const district = (formData.get("district") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const birth_date = (formData.get("birth_date") as string) || null;
  const whatsapp = (formData.get("whatsapp") as string)?.trim() || null;
  const availabilityRaw = (formData.get("availability") as string) || "inmediata";
  const languagesRaw = formData.get("languages") as string | null;

  if (professional_title && professional_title.length > 100) {
    return { error: "El título profesional no puede superar 100 caracteres." };
  }
  if (!AVAILABILITY_VALUES.includes(availabilityRaw as AvailabilityStatus)) {
    return { error: "Disponibilidad inválida." };
  }
  if (birth_date && new Date(birth_date) > new Date()) {
    return { error: "La fecha de nacimiento no puede ser futura." };
  }

  const hourly_rate = parsePositiveNumber(formData.get("hourly_rate"));
  const daily_rate = parsePositiveNumber(formData.get("daily_rate"));
  if (hourly_rate === "invalid" || daily_rate === "invalid") {
    return { error: "Las tarifas deben ser números positivos." };
  }

  const years_experience = parseBoundedInt(formData.get("years_experience"), 0, 60);
  if (years_experience === "invalid") {
    return { error: "Los años de experiencia deben estar entre 0 y 60." };
  }

  const work_radius_km = parseBoundedInt(formData.get("work_radius_km"), 0, 500);
  if (work_radius_km === "invalid") {
    return { error: "El radio de trabajo debe estar entre 0 y 500 km." };
  }

  const languages = languagesRaw
    ? languagesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  try {
    const { error } = await supabase.from("worker_profile_details").upsert({
      profile_id: user.id,
      professional_title,
      district,
      address,
      birth_date,
      whatsapp,
      availability: availabilityRaw as AvailabilityStatus,
      hourly_rate,
      daily_rate,
      years_experience,
      languages,
      work_radius_km,
    });

    if (error) return { error: formatSupabaseError(error, "upsertWorkerProfileDetails") };
  } catch (err) {
    return { error: formatUnknownError(err, "upsertWorkerProfileDetails") };
  }

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker");
  return { success: true };
}

function parsePositiveNumber(value: FormDataEntryValue | null): number | null | "invalid" {
  if (!value || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return "invalid";
  return n;
}

function parseBoundedInt(
  value: FormDataEntryValue | null,
  min: number,
  max: number
): number | null | "invalid" {
  if (!value || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return "invalid";
  return n;
}

// ── Worker experience (Fase 2) ─────────────────────────────────────────────────

export async function getWorkerExperience(): Promise<WorkerExperience[]> {
  const { supabase, user } = await getAuth();
  if (!user) return [];

  const { data } = await supabase
    .from("worker_experience")
    .select("*")
    .eq("profile_id", user.id)
    .order("is_current", { ascending: false })
    .order("start_date", { ascending: false });

  return (data as WorkerExperience[]) ?? [];
}

interface ExperienceInput {
  company: string;
  job_title: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
}

function parseExperienceForm(formData: FormData): ExperienceInput | { error: string } {
  const company = (formData.get("company") as string)?.trim();
  const job_title = (formData.get("job_title") as string)?.trim();
  const start_date = (formData.get("start_date") as string) || "";
  const is_current = formData.get("is_current") === "true";
  const end_date_raw = (formData.get("end_date") as string) || "";
  const description = (formData.get("description") as string)?.trim() || null;

  if (!company) return { error: "La empresa es obligatoria." };
  if (!job_title) return { error: "El cargo es obligatorio." };
  if (!start_date || Number.isNaN(new Date(start_date).getTime())) {
    return { error: "La fecha de inicio es obligatoria." };
  }
  if (new Date(start_date) > new Date()) {
    return { error: "La fecha de inicio no puede ser futura." };
  }

  const end_date = is_current ? null : end_date_raw || null;
  if (end_date) {
    if (Number.isNaN(new Date(end_date).getTime())) {
      return { error: "La fecha de fin no es válida." };
    }
    if (new Date(end_date) < new Date(start_date)) {
      return { error: "La fecha de fin no puede ser anterior a la de inicio." };
    }
  }
  if (description && description.length > 500) {
    return { error: "La descripción no puede superar 500 caracteres." };
  }

  return { company, job_title, start_date, end_date, is_current, description };
}

export async function addWorkerExperience(
  formData: FormData
): Promise<ActionResult & { experience?: WorkerExperience }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const parsed = parseExperienceForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("worker_experience")
    .insert({ profile_id: user.id, ...parsed })
    .select()
    .single();

  if (error) return { error: formatSupabaseError(error, "addWorkerExperience") };

  revalidatePath("/dashboard/worker/profile");
  return { success: true, experience: data as WorkerExperience };
}

export async function updateWorkerExperience(
  experienceId: string,
  formData: FormData
): Promise<ActionResult & { experience?: WorkerExperience }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const parsed = parseExperienceForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("worker_experience")
    .update(parsed)
    .eq("id", experienceId)
    .eq("profile_id", user.id)
    .select()
    .single();

  if (error) return { error: formatSupabaseError(error, "updateWorkerExperience") };

  revalidatePath("/dashboard/worker/profile");
  return { success: true, experience: data as WorkerExperience };
}

export async function deleteWorkerExperience(experienceId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase
    .from("worker_experience")
    .delete()
    .eq("id", experienceId)
    .eq("profile_id", user.id);

  if (error) return { error: formatSupabaseError(error, "deleteWorkerExperience") };

  revalidatePath("/dashboard/worker/profile");
  return { success: true };
}
