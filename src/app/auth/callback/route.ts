import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isNewOAuthUser } from "@/lib/auth-new-user";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";
  const isPasswordRecovery = next === "/reset-password";
  // Fase C4-G10.5: señal explícita de register()/resendConfirmationEmail()
  // (src/lib/actions/auth.ts) — isNewOAuthUser() (sin cambios) es una
  // ventana de 10s pensada para OAuth y se demostró insuficiente para
  // confirmaciones de email (gaps reales de hasta ~15 min). Solo se
  // compara por igualdad literal: nunca se usa para construir una URL ni
  // para autorizar nada, así que un valor falsificado en el enlace no
  // tiene efecto sin un `code` de sesión válido previo.
  const isEmailSignupFlow = searchParams.get("flow") === "email_signup";

  // Preserva `next` en cada redirect de error a /login — antes se perdía
  // aquí, así que cancelar el consentimiento de Google (o cualquier otro
  // fallo) mandaba siempre a /dashboard tras reintentar, en vez de volver
  // a la página desde la que el usuario había iniciado el login.
  function loginWithError(errorCode: string): NextResponse {
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", errorCode);
    if (next !== "/dashboard" && !isPasswordRecovery) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (error) {
    return loginWithError("oauth_cancelled");
  }

  if (code) {
    const supabase = createClient();
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (!sessionError) {
      // Recuperación de contraseña: nunca es una cuenta "nueva" a efectos
      // del asistente de onboarding, aunque los timestamps coincidan.
      if (!isPasswordRecovery) {
        const user = data.user;
        if (isEmailSignupFlow || isNewOAuthUser(user?.created_at, user?.last_sign_in_at)) {
          const onboardingUrl = new URL(`${origin}/onboarding`);
          if (next !== "/dashboard") onboardingUrl.searchParams.set("next", next);
          return NextResponse.redirect(onboardingUrl);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // El enlace de recuperación de contraseña expira o puede usarse una sola
  // vez — mensaje específico en vez del genérico "oauth_failed", que
  // hablaría de Google sin sentido en este flujo.
  return loginWithError(isPasswordRecovery ? "reset_link_expired" : "oauth_failed");
}
