/** Ventana entre created_at y last_sign_in_at que consideramos "primer login". */
export const NEW_USER_WINDOW_MS = 10_000;

/**
 * Heurística estándar para detectar el primer login OAuth de un usuario:
 * Supabase no expone un flag explícito "isNewUser" en exchangeCodeForSession(),
 * pero en la creación de la cuenta created_at y last_sign_in_at quedan
 * (casi) idénticos; en logins posteriores last_sign_in_at avanza mientras
 * created_at queda fijo. Separada en función pura para probarla sin
 * mockear Supabase — usada por src/app/auth/callback/route.ts para decidir
 * si manda al asistente de onboarding (/onboarding) en vez del destino normal.
 */
export function isNewOAuthUser(createdAt: string | null | undefined, lastSignInAt: string | null | undefined): boolean {
  if (!createdAt || !lastSignInAt) return false;
  const diff = Math.abs(new Date(lastSignInAt).getTime() - new Date(createdAt).getTime());
  return diff < NEW_USER_WINDOW_MS;
}
