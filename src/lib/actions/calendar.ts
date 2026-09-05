"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { ProfileAvailabilitySlot, ProfileAvailabilityException } from "@/lib/types";

/**
 * FASE 3F (Calendario) — Server Actions que conectan el esquema de
 * disponibilidad/horario (0051-0055) con la aplicación. Ninguna de estas
 * funciones usa `createAdminClient()`: toda la autorización real sigue
 * viviendo en RLS (0051/0052 lectura pública/escritura del dueño; 0054
 * doble consentimiento + trigger `protect_application_schedule_consent()`;
 * 0055 copia de horario al aceptar). Las comprobaciones de aquí son
 * defensa en profundidad y mensajes legibles — mismo patrón que
 * jobs.ts/roles.ts — nunca la única barrera.
 */

async function getAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export interface MyAvailability {
  slots: ProfileAvailabilitySlot[];
  exceptions: ProfileAvailabilityException[];
}

/** Disponibilidad completa (slots + excepciones) del usuario autenticado. */
export async function getMyAvailability(): Promise<MyAvailability | { error: string }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  const [{ data: slots, error: slotsError }, { data: exceptions, error: exceptionsError }] =
    await Promise.all([
      supabase
        .from("profile_availability_slots")
        .select("*")
        .eq("profile_id", user.id)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("profile_availability_exceptions")
        .select("*")
        .eq("profile_id", user.id)
        .order("exception_date", { ascending: true }),
    ]);

  if (slotsError || exceptionsError) {
    return { error: "No se pudo obtener tu disponibilidad." };
  }

  return {
    slots: (slots as unknown as ProfileAvailabilitySlot[]) ?? [],
    exceptions: (exceptions as unknown as ProfileAvailabilityException[]) ?? [],
  };
}

export type SaveAvailabilityInput =
  | {
      kind: "slot";
      /** Si viene, actualiza ese slot propio; si no, crea uno nuevo. */
      id?: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_active?: boolean;
    }
  | {
      kind: "exception";
      exception_date: string;
      is_available: boolean;
      start_time?: string | null;
      end_time?: string | null;
    };

/**
 * Crea/actualiza un slot recurrente o una excepción puntual. `profile_id`
 * siempre se deriva de `auth.uid()` — nunca se acepta del caller. Un slot
 * existente ajeno (id de otro usuario) se rechaza explícitamente en vez
 * de dejar que un UPDATE con `.eq("profile_id", ...)` simplemente no
 * afecte filas en silencio.
 */
export async function saveAvailability(input: SaveAvailabilityInput): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  if (input.kind === "slot") {
    if (!Number.isInteger(input.day_of_week) || input.day_of_week < 0 || input.day_of_week > 6) {
      return { error: "Día de la semana inválido." };
    }
    if (!isValidTime(input.start_time) || !isValidTime(input.end_time)) {
      return { error: "Horario inválido." };
    }
    if (input.start_time >= input.end_time) {
      return { error: "La hora de inicio debe ser anterior a la hora de fin." };
    }

    const payload = {
      profile_id: user.id,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      is_active: input.is_active ?? true,
    };

    if (input.id) {
      const { data: existing } = await supabase
        .from("profile_availability_slots")
        .select("profile_id")
        .eq("id", input.id)
        .single();
      const typed = existing as { profile_id: string } | null;
      if (!typed) return { error: "Disponibilidad no encontrada." };
      if (typed.profile_id !== user.id) return { error: "Sin permiso." };

      const { error } = await supabase
        .from("profile_availability_slots")
        .update(payload)
        .eq("id", input.id);
      if (error) return { error: "No se pudo actualizar tu disponibilidad." };
    } else {
      const { error } = await supabase.from("profile_availability_slots").insert(payload);
      if (error) return { error: "No se pudo guardar tu disponibilidad." };
    }

    revalidatePath("/dashboard/worker/profile");
    revalidatePath("/dashboard/employer/profile");
    return { success: true };
  }

  // input.kind === "exception"
  if (!DATE_RE.test(input.exception_date)) {
    return { error: "Fecha inválida." };
  }

  if (input.is_available) {
    if (!isValidTime(input.start_time) || !isValidTime(input.end_time)) {
      return { error: "Debes indicar un horario completo para un día disponible." };
    }
    if (input.start_time >= input.end_time) {
      return { error: "La hora de inicio debe ser anterior a la hora de fin." };
    }
  } else if (input.start_time || input.end_time) {
    return { error: "Un día marcado como no disponible no puede tener horario." };
  }

  // Único por (profile_id, exception_date) — 0052. El upsert nunca puede
  // pisar la excepción de otro usuario: la clave de conflicto incluye
  // profile_id, y payload.profile_id siempre es el del propio caller.
  const { error } = await supabase.from("profile_availability_exceptions").upsert(
    {
      profile_id: user.id,
      exception_date: input.exception_date,
      is_available: input.is_available,
      start_time: input.is_available ? input.start_time : null,
      end_time: input.is_available ? input.end_time : null,
    },
    { onConflict: "profile_id,exception_date" }
  );
  if (error) return { error: "No se pudo guardar la excepción." };

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/employer/profile");
  return { success: true };
}

/** Elimina un slot o excepción — únicamente si pertenece al usuario autenticado. */
export async function deleteAvailability(
  kind: "slot" | "exception",
  id: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  const table = kind === "slot" ? "profile_availability_slots" : "profile_availability_exceptions";

  const { data: existing } = await supabase.from(table).select("profile_id").eq("id", id).single();
  const typed = existing as { profile_id: string } | null;
  if (!typed) return { error: "No encontrado." };
  if (typed.profile_id !== user.id) return { error: "Sin permiso." };

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar." };

  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/employer/profile");
  return { success: true };
}

/**
 * Disponibilidad pública de un perfil (para que la otra parte la consulte
 * antes de proponer/aceptar horario) — mismo criterio de lectura pública
 * que `public_workers`. No usa `createAdminClient()`: las policies
 * `..._select_all` (`using(true)`) ya permiten esta lectura sin
 * necesidad de service role. Solo expone slots activos.
 */
export async function getProfileAvailability(profileId: string): Promise<MyAvailability> {
  const supabase = createClient();
  const [{ data: slots }, { data: exceptions }] = await Promise.all([
    supabase
      .from("profile_availability_slots")
      .select("*")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("profile_availability_exceptions")
      .select("*")
      .eq("profile_id", profileId)
      .order("exception_date", { ascending: true }),
  ]);

  return {
    slots: (slots as unknown as ProfileAvailabilitySlot[]) ?? [],
    exceptions: (exceptions as unknown as ProfileAvailabilityException[]) ?? [],
  };
}

/**
 * El empleador propone (o modifica) el horario de una postulación propia.
 * Nunca incluye `worker_schedule_confirmed_at` en el payload — aunque lo
 * hiciera, `protect_application_schedule_consent()` (0054) lo revertiría.
 */
export async function proposeApplicationSchedule(
  applicationId: string,
  proposedStartAt: string,
  proposedEndAt: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  const start = new Date(proposedStartAt);
  const end = new Date(proposedEndAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Horario inválido." };
  }
  if (end.getTime() <= start.getTime()) {
    return { error: "La hora de fin debe ser posterior a la hora de inicio." };
  }

  const { data: app } = await supabase
    .from("job_applications")
    .select("status, job_id")
    .eq("id", applicationId)
    .single();

  const typedApp = app as { status: string; job_id: string } | null;
  if (!typedApp) return { error: "Postulación no encontrada." };

  const { data: job } = await supabase
    .from("jobs")
    .select("employer_id")
    .eq("id", typedApp.job_id)
    .single();

  const typedJob = job as { employer_id: string } | null;
  if (!typedJob || typedJob.employer_id !== user.id) return { error: "Sin permiso." };
  if (typedApp.status !== "pendiente") {
    return { error: "Solo puedes proponer horario en postulaciones pendientes." };
  }

  const { error } = await supabase
    .from("job_applications")
    .update({
      proposed_start_at: start.toISOString(),
      proposed_end_at: end.toISOString(),
    })
    .eq("id", applicationId);

  if (error) return { error: "No se pudo proponer el horario." };

  revalidatePath(`/jobs/${typedApp.job_id}`);
  revalidatePath("/dashboard/employer/applicants");
  return { success: true };
}

/**
 * El trabajador confirma la propuesta ya existente de una postulación
 * propia. Nunca incluye `proposed_start_at`/`proposed_end_at` en el
 * payload — igual defensa en profundidad que arriba, respaldada por 0054.
 */
export async function confirmApplicationSchedule(applicationId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  const { data: app } = await supabase
    .from("job_applications")
    .select("status, worker_id, job_id, proposed_start_at, proposed_end_at")
    .eq("id", applicationId)
    .single();

  const typedApp = app as {
    status: string;
    worker_id: string;
    job_id: string;
    proposed_start_at: string | null;
    proposed_end_at: string | null;
  } | null;
  if (!typedApp) return { error: "Postulación no encontrada." };
  if (typedApp.worker_id !== user.id) return { error: "Sin permiso." };
  if (typedApp.status !== "pendiente") {
    return { error: "Solo puedes confirmar horario en postulaciones pendientes." };
  }
  if (!typedApp.proposed_start_at || !typedApp.proposed_end_at) {
    return { error: "El empleador todavía no propuso un horario." };
  }

  const { error } = await supabase
    .from("job_applications")
    .update({ worker_schedule_confirmed_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) return { error: "No se pudo confirmar el horario." };

  revalidatePath(`/jobs/${typedApp.job_id}`);
  revalidatePath("/dashboard/worker");
  return { success: true };
}

export interface CalendarJob {
  id: string;
  title: string;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  city: string | null;
  district: string | null;
  /** Nombre de la contraparte — empleador (vista worker) o trabajador asignado (vista employer). */
  counterpartName: string | null;
}

export interface MyCalendar {
  /** Trabajos agendados donde el usuario es el trabajador asignado. */
  asWorker: CalendarJob[];
  /** Trabajos agendados de publicaciones propias del usuario como empleador. */
  asEmployer: CalendarJob[];
}

interface CalendarJobRow {
  id: string;
  title: string;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  city: string | null;
  district: string | null;
  employer_id: string;
  assigned_worker_id: string | null;
}

/**
 * Trabajos agendados (con horario confirmado) del usuario autenticado,
 * separados conceptualmente de su disponibilidad propia (getMyAvailability()).
 * Consulta ambos roles POSEÍDOS vía filtros directos sobre `jobs`
 * (`assigned_worker_id`/`employer_id` = auth.uid()) — no depende de
 * `profiles.role` en absoluto, así que un usuario multi-role ve su
 * agenda completa de ambos roles sin cambiar su modo activo.
 *
 * El nombre de la contraparte se resuelve vía `public_profiles`/
 * `public_workers` (mismo patrón que employers.ts/workers.ts) — nunca
 * `createAdminClient()`: son vistas ya diseñadas para lectura pública de
 * terceros sin necesitar service role.
 */
export async function getMyCalendar(): Promise<MyCalendar | { error: string }> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "Debes iniciar sesión." };

  const columns =
    "id, title, status, scheduled_start_at, scheduled_end_at, city, district, employer_id, assigned_worker_id";
  const [
    { data: asWorkerRows, error: workerError },
    { data: asEmployerRows, error: employerError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(columns)
      .eq("assigned_worker_id", user.id)
      .not("scheduled_start_at", "is", null)
      .order("scheduled_start_at", { ascending: true }),
    supabase
      .from("jobs")
      .select(columns)
      .eq("employer_id", user.id)
      .not("scheduled_start_at", "is", null)
      .order("scheduled_start_at", { ascending: true }),
  ]);

  if (workerError || employerError) {
    return { error: "No se pudo obtener tu calendario." };
  }

  const workerRows = (asWorkerRows as unknown as CalendarJobRow[]) ?? [];
  const employerRows = (asEmployerRows as unknown as CalendarJobRow[]) ?? [];

  const employerIds = [...new Set(workerRows.map((j) => j.employer_id))];
  const workerIds = [
    ...new Set(
      employerRows.map((j) => j.assigned_worker_id).filter((id): id is string => Boolean(id))
    ),
  ];

  const [{ data: employerProfiles }, { data: workerProfiles }] = await Promise.all([
    employerIds.length
      ? supabase.from("public_profiles").select("id, full_name").in("id", employerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    workerIds.length
      ? supabase.from("public_workers").select("id, full_name").in("id", workerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const employerNameById = new Map(
    ((employerProfiles as unknown as { id: string; full_name: string }[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ])
  );
  const workerNameById = new Map(
    ((workerProfiles as unknown as { id: string; full_name: string }[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ])
  );

  return {
    asWorker: workerRows.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      scheduled_start_at: j.scheduled_start_at,
      scheduled_end_at: j.scheduled_end_at,
      city: j.city,
      district: j.district,
      counterpartName: employerNameById.get(j.employer_id) ?? null,
    })),
    asEmployer: employerRows.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      scheduled_start_at: j.scheduled_start_at,
      scheduled_end_at: j.scheduled_end_at,
      city: j.city,
      district: j.district,
      counterpartName: j.assigned_worker_id ? workerNameById.get(j.assigned_worker_id) ?? null : null,
    })),
  };
}
