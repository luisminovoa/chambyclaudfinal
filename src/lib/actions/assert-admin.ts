"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Único punto de verdad para "¿es admin quien llama a esta Server
 * Action?" — extraído de admin.ts para que otros dominios (beta.ts,
 * reports.ts) no dependan de un archivo ajeno a su feature solo para
 * una utilidad genérica, y para que no exista una segunda
 * implementación que alguien olvide llamar (el bug que tenían
 * getBetaStats()/getBugReports(): usaban createAdminClient() —
 * service role, sin RLS — sin ningún chequeo de sesión/rol antes).
 *
 * No depende de middleware ni de que la UI oculte nada — lee la sesión
 * y el rol directamente en cada llamada.
 */
export async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profileRaw } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const profile = profileRaw as unknown as { role: string } | null;
  if (profile?.role !== "admin") throw new Error("No autorizado");

  return { supabase, adminId: user.id };
}
