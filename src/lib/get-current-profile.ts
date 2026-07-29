import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/**
 * Envuelto en React `cache()` para que, aunque Navbar, BottomNav y una
 * página lo llamen todos en el mismo request, Supabase solo se consulte
 * una vez (deduplicación automática dentro del mismo render de servidor).
 *
 * Devuelve:
 *   user       – usuario autenticado o null
 *   profile    – perfil completo o null
 *   userRoles  – roles activos que posee el usuario (p.ej. ["worker","employer"])
 *                profile.role es el MODO ACTIVO; userRoles son los roles DISPONIBLES.
 */
export const getCurrentUserAndProfile = cache(async (): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  userRoles: UserRole[];
}> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null, userRoles: [] };

  const [{ data: profile }, { data: rolesData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("active", true),
  ]);

  const userRoles: UserRole[] = (rolesData ?? []).map((r: { role: UserRole }) => r.role);

  return { user, profile: (profile as Profile) ?? null, userRoles };
});
