"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type {
  ProfilePhoto,
  VerificationDocument,
  DocumentType,
  ProfileStats,
  WorkerProfileDetails,
  AvailabilityStatus,
  WorkerExperience,
} from "@/lib/types";

const AVAILABILITY_VALUES: AvailabilityStatus[] = [
  "inmediata",
  "una_semana",
  "un_mes",
  "no_disponible",
];

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

  const { error } = await supabase
    .from("profiles")
    .update({ bio, phone, city, category, skills })
    .eq("id", user.id);

  if (error) return { error: "Error al guardar el perfil." };

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker");
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

  if (error) return { error: "Error al guardar la foto." };

  if (params.isPrimary) {
    await supabase
      .from("profiles")
      .update({ avatar_url: params.publicUrl })
      .eq("id", user.id);
  }

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker");
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

  if (error) return { error: "Error al eliminar la foto." };

  if (p.is_primary) {
    await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
  }

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker");
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

  if (error) return { error: "Error al cambiar la foto principal." };

  await supabase
    .from("profiles")
    .update({ avatar_url: (photo as { public_url: string }).public_url })
    .eq("id", user.id);

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker");
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

  if (error) return { error: "Error al guardar el documento." };

  revalidatePath("/dashboard/worker/profile");
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

  if (error) return { error: "Error al eliminar el documento." };

  revalidatePath("/dashboard/worker/profile");
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

export async function computeAndSaveProfileStats(): Promise<
  ActionResult & { stats?: ProfileStats }
> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const [profileRes, photosRes, docsRes, detailsRes, experienceRes] = await Promise.all([
    supabase.from("profiles").select("bio,category,skills").eq("id", user.id).single(),
    supabase.from("profile_photos").select("is_primary").eq("profile_id", user.id),
    supabase.from("verification_documents").select("document_type,status").eq("profile_id", user.id),
    supabase
      .from("worker_profile_details")
      .select("professional_title,years_experience,hourly_rate,daily_rate")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("worker_experience")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id),
  ]);

  const profile = profileRes.data as {
    bio: string | null;
    category: string | null;
    skills: string[];
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

  // Foto principal = 10%
  if (photos.some((p) => p.is_primary)) score += 10;

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

  // Antecedentes verificados = 5%
  const antecOk = docs.some(
    (d) =>
      (d.document_type === "antecedentes_policiales" ||
        d.document_type === "antecedentes_penales") &&
      d.status === "verified"
  );
  if (antecOk) score += 5;

  // Experiencia laboral registrada = 10% (al menos 1 experiencia)
  if ((experienceRes.count ?? 0) >= 1) score += 10;

  // Insignia Perfil Destacado
  if (score >= 80) badges.push("top_profile");

  const trust_score = Math.min(100, score + badges.length * 3);

  const { data, error } = await supabase
    .from("profile_stats")
    .upsert({
      profile_id: user.id,
      completion_percentage: score,
      trust_score,
      badges,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { error: "Error al calcular estadísticas." };

  revalidatePath("/dashboard/worker/profile");
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

  if (error) return { error: "Error al guardar la información profesional." };

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

  if (error) return { error: "Error al guardar la experiencia." };

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

  if (error) return { error: "Error al actualizar la experiencia." };

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

  if (error) return { error: "Error al eliminar la experiencia." };

  revalidatePath("/dashboard/worker/profile");
  return { success: true };
}
