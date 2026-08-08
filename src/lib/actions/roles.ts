"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
 * ⚠️ DIAGNÓSTICO TEMPORAL (quitar tras confirmar la causa raíz del error
 * "No se pudo cambiar el modo activo."): agrega console.error() server-side
 * con user.id/rol solicitado/filas de user_roles/profile.role actual/
 * código+mensaje+details+hint del error real de Postgres, y devuelve un
 * mensaje de error prefijado con la etapa exacta (A-G) en vez del genérico.
 * No registra contraseñas, tokens, cookies ni claves de Supabase — solo
 * IDs y valores de rol, que ya son visibles para el propio usuario.
 */
export async function switchRoleAction(newRole: UserRole): Promise<ActionResult> {
  const { supabase, user } = await getAuth();
  if (!user) {
    console.error("[DIAG switchRoleAction] (A) auth: sin usuario autenticado");
    return { error: "[DIAG A] No autenticado." };
  }

  const { data: allRoles, error: allRolesError } = await supabase
    .from("user_roles")
    .select("role, active")
    .eq("user_id", user.id);

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: roleRow, error: roleLookupError } = await supabase
    .from("user_roles")
    .select("id, active")
    .eq("user_id", user.id)
    .eq("role", newRole)
    .eq("active", true)
    .maybeSingle();

  console.error("[DIAG switchRoleAction] (B) búsqueda de rol destino", {
    userId: user.id,
    requestedRole: newRole,
    userRolesFound: allRoles,
    allRolesError: allRolesError
      ? { code: allRolesError.code, message: allRolesError.message, details: allRolesError.details, hint: allRolesError.hint }
      : null,
    currentProfileRole: (currentProfile as { role?: string } | null)?.role ?? null,
    currentProfileError: currentProfileError
      ? { code: currentProfileError.code, message: currentProfileError.message, details: currentProfileError.details, hint: currentProfileError.hint }
      : null,
    targetRoleRow: roleRow,
    targetRoleActive: (roleRow as { active?: boolean } | null)?.active ?? null,
    roleLookupError: roleLookupError
      ? { code: roleLookupError.code, message: roleLookupError.message, details: roleLookupError.details, hint: roleLookupError.hint }
      : null,
  });

  if (roleLookupError) {
    return {
      error: `[DIAG B] Falló la búsqueda en user_roles — code=${roleLookupError.code ?? "?"} message=${roleLookupError.message}`,
    };
  }

  if (!roleRow) {
    console.error("[DIAG switchRoleAction] (C) validación: no hay fila user_roles activa para", newRole);
    return { error: "No tienes acceso a ese rol." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", user.id);

  console.error("[DIAG switchRoleAction] (D) UPDATE profiles", {
    userId: user.id,
    requestedRole: newRole,
    error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
  });

  if (error) {
    return {
      error: `[DIAG D] UPDATE profiles falló — code=${error.code ?? "?"} message=${error.message} details=${error.details ?? "-"} hint=${error.hint ?? "-"}`,
    };
  }

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

  const cityValue = formData.get("city");
  const city = typeof cityValue === "string" && cityValue.trim().length > 0 ? cityValue.trim() : null;
  if (city) {
    const { error } = await supabase.from("profiles").update({ city }).eq("id", user.id);
    if (error) return { error: "No se pudo guardar tu ciudad, pero tu cuenta ya está lista." };
  }

  revalidatePath("/", "layout");

  const nextValue = formData.get("next");
  const next =
    typeof nextValue === "string" && /^\/(?!\/)[^\\]*$/.test(nextValue) ? nextValue : "/dashboard";
  redirect(next);
}
