import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/**
 * Envuelto en React `cache()` para que, aunque Navbar, BottomNav y una
 * página lo llamen todos en el mismo request, Supabase solo se consulte
 * una vez (deduplicación automática dentro del mismo render de servidor).
 *
 * `userRoles` (sistema multi-rol, docs/DISENO-MULTI-ROL.md) es aditivo:
 * `profile.role` sigue siendo el modo activo, sin cambios. Callers
 * existentes que no lo desestructuran siguen funcionando igual.
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

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("active", true),
  ]);

  return {
    user,
    profile: (profile as Profile) ?? null,
    userRoles: (roleRows ?? []).map((r) => r.role),
  };
});
