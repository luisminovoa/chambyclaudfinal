"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/** Devuelve los roles activos del usuario autenticado. */
export async function getUserRoles(): Promise<UserRole[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);

  return (data ?? []).map((r: { role: UserRole }) => r.role);
}

/** Comprueba si el usuario autenticado posee un rol activo. */
export async function hasRole(role: UserRole): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.includes(role);
}

/**
 * Activa el rol de empleador para el usuario.
 * Si ya lo tenía (pero inactivo) lo reactiva.
 * No cambia el modo activo: el usuario sigue en worker mode hasta que haga switch.
 */
export async function enableEmployerRole(): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("user_roles").upsert(
    { user_id: user.id, role: "employer" as UserRole, active: true },
    { onConflict: "user_id,role" }
  );

  if (error) return { error: "No se pudo activar el rol de empleador." };

  revalidatePath("/dashboard/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Desactiva el rol de empleador.
 * Si el modo activo es "employer", cambia automáticamente a "worker".
 */
export async function disableEmployerRole(): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Verificar que el usuario tenga el rol de worker activo antes de desactivar employer
  const { data: workerRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "worker")
    .eq("active", true)
    .maybeSingle();

  if (!workerRole) {
    return { error: "Debes conservar al menos el rol de trabajador." };
  }

  // Desactivar employer en user_roles
  const { error: deactivateError } = await supabase
    .from("user_roles")
    .update({ active: false })
    .eq("user_id", user.id)
    .eq("role", "employer");

  if (deactivateError) return { error: "No se pudo desactivar el rol." };

  // Si el modo activo es employer, forzar cambio a worker
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile && (profile as { role: UserRole }).role === "employer") {
    await supabase.from("profiles").update({ role: "worker" }).eq("id", user.id);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Cambia el modo activo del usuario (actualiza profiles.role).
 * Requiere que el usuario posea el rol destino en user_roles.
 */
export async function switchRoleAction(
  newRole: UserRole
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Verificar que el usuario posea el rol destino
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

  if (error) return { error: "No se pudo cambiar el modo." };

  revalidatePath("/", "layout");
  return { success: true };
}
