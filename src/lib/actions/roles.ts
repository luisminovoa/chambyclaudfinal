"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeCity } from "@/lib/cities";
import { validateLocationInput } from "@/lib/ubigeo";
import type { UserRole } from "@/lib/types";

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

/** `FormData.get()` devuelve `File | string | null` — normaliza a `string | null` para validateLocationInput(). */
function readOptionalStringField(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : null;
}

/** Roles activos que posee el usuario autenticado (puede ser más de uno). */
export async function getUserRoles(): Promise<UserRole[]> {
  const { supabase, user } = await getAuth();
  if (!user) return [];

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);

  return (data ?? []).map((r) => r.role);
}

/** Comprueba si el usuario autenticado posee un rol activo. */
export async function hasRole(role: UserRole): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.includes(role);
}

/** Modo activo actual (profiles.role) — cuál dashboard/RLS-gate está usando ahora. */
export async function getActiveRole(): Promise<UserRole | null> {
  const { supabase, user } = await getAuth();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (data as { role: UserRole } | null)?.role ?? null;
}

/**
 * Agrega el rol employer al usuario sin quitarle ningún rol existente.
 * Si ya lo posee pero está desactivado, lo reactiva. No cambia el modo
 * activo (profiles.role) — eso lo hace switchRoleAction() por separado.
 *
 * No usa .upsert(): el UPDATE de la rama ON CONFLICT tocaría las columnas
 * `role`/`user_id`, que ya no tienen GRANT UPDATE tras el hardening de
 * 0014_multi_role.sql (candado de columna contra V4) y el intento fallaría.
 */
export async function enableEmployerRole(): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { data: existing, error: selectError } = await supabase
    .from("user_roles")
    .select("id, active")
    .eq("user_id", user.id)
    .eq("role", "employer")
    .maybeSingle();

  if (selectError) return { error: "No se pudo verificar el rol de empleador." };

  if (existing) {
    if (!existing.active) {
      const { error } = await supabase
        .from("user_roles")
        .update({ active: true })
        .eq("id", existing.id);
      if (error) return { error: "No se pudo activar el rol de empleador." };
    }
  } else {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "employer" });
    if (error) return { error: "No se pudo agregar el rol de empleador." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Cambia el modo activo del usuario (profiles.role). Requiere que el
 * usuario ya posea el rol destino en user_roles — nunca crea un rol nuevo
 * (eso es responsabilidad exclusiva de enableEmployerRole()).
 *
 * La policy RLS `profiles_update_own` (0018_fix_admin_role_switch_rls.sql)
 * es la que realmente autoriza — o rechaza — el UPDATE hacia 'admin' según
 * si el usuario posee una fila user_roles(role='admin', active=true); esta
 * función no necesita replicar esa condición, solo dar el mensaje genérico
 * si Postgres la rechaza.
 */
export async function switchRoleAction(newRole: UserRole): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", newRole)
    .eq("active", true)
    .maybeSingle();

  if (!roleRow) return { error: "No tienes acceso a ese rol." };

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", user.id);

  if (error) return { error: "No se pudo cambiar el modo activo." };

  revalidatePath("/", "layout");
  return { success: true };
}

type OnboardingActionResult = { error?: string };

/**
 * Único paso del asistente breve tras el primer login con Google
 * (src/app/auth/callback/route.ts detecta cuenta nueva y redirige a
 * /onboarding). handle_new_user() ya deja al usuario como "worker" por
 * defecto — esta acción solo agrega/activa "employer" si corresponde y
 * guarda la ciudad si el usuario la completó. Reutiliza
 * enableEmployerRole()/switchRoleAction() ya existentes, ningún flujo de
 * roles nuevo.
 */
export async function completeGoogleOnboarding(
  _prev: OnboardingActionResult,
  formData: FormData
): Promise<OnboardingActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) return { error: "No autenticado." };

  const intent = formData.get("intent");
  if (intent !== "worker" && intent !== "employer" && intent !== "both") {
    return { error: "Selecciona una opción para continuar." };
  }

  if (intent === "employer" || intent === "both") {
    const enableResult = await enableEmployerRole();
    if ("error" in enableResult) return enableResult;
  }

  // "both" deja el modo activo en worker (default de handle_new_user());
  // solo "employer" cambia el modo activo de inmediato.
  if (intent === "employer") {
    const switchResult = await switchRoleAction("employer");
    if ("error" in switchResult) return switchResult;
  }

  // normalizeCity() (Fase C4-D): el <select> del onboarding ya restringe
  // la UI al catálogo, pero esta Server Action no depende únicamente de
  // eso — reutiliza la misma normalización que InfoTab/EmployerInfoTab
  // para que una variante histórica (p. ej. "CHICLAYO") llegue a BD en su
  // forma canónica. Nunca inventa una ciudad para un valor fuera del
  // catálogo (lo conserva tal cual, igual que en el resto de la app), y
  // preserva el comportamiento existente de ciudad vacía/ausente = opcional.
  const cityValue = formData.get("city");
  const city = normalizeCity(typeof cityValue === "string" ? cityValue : null);

  // Fase C4-G9.2.1 (Paso 1 de C4-G9.2): department/province/district son
  // opcionales — RoleOnboardingForm.tsx todavía no los envía (eso es el
  // Paso 2, pendiente de autorización aparte), así que hoy siempre llegan
  // ausentes y este bloque es un no-op puro: el comportamiento observable
  // para el formulario actual (solo `city`) no cambia. Reutiliza
  // validateLocationInput() (src/lib/ubigeo.ts) — misma fuente de verdad
  // que ya usan updateProfile() y createJob(), sin duplicar la validación
  // jerárquica aquí. El cliente nunca es una fuente de verdad confiable,
  // así que esta comprobación corre siempre en el servidor, sin importar
  // qué valide (o no) un futuro LocationSelector en el formulario.
  const location = validateLocationInput({
    department: readOptionalStringField(formData, "department"),
    province: readOptionalStringField(formData, "province"),
    district: readOptionalStringField(formData, "district"),
  });
  if ("error" in location) return { error: location.error };

  // Un solo UPDATE combinando lo que efectivamente venga: hoy siempre es
  // solo `city` (o nada, si viene vacía) — mismo resultado que antes de
  // este cambio. Cuando el formulario empiece a enviar ubicación
  // jerárquica (Paso 2), department/province/district se guardan junto a
  // `city` en la misma escritura, en vez de una segunda llamada aparte.
  const profileLocationUpdates: Record<string, string> = {};
  if (city) profileLocationUpdates.city = city;
  if (location.department) profileLocationUpdates.department = location.department;
  if (location.province) profileLocationUpdates.province = location.province;
  if (location.district) profileLocationUpdates.district = location.district;

  if (Object.keys(profileLocationUpdates).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(profileLocationUpdates)
      .eq("id", user.id);
    if (error) return { error: "No se pudo guardar tu ciudad, pero tu cuenta ya está lista." };
  }

  revalidatePath("/", "layout");

  const nextValue = formData.get("next");
  const next =
    typeof nextValue === "string" && /^\/(?!\/)[^\\]*$/.test(nextValue) ? nextValue : "/dashboard";
  redirect(next);
}
