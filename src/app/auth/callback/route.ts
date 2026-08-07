import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isNewOAuthUser } from "@/lib/auth-new-user";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";
  const isPasswordRecovery = next === "/reset-password";

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_cancelled`);
  }

  if (code) {
    const supabase = createClient();
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (!sessionError) {
      // Recuperación de contraseña: nunca es una cuenta "nueva" a efectos
      // del asistente de onboarding, aunque los timestamps coincidan.
      if (!isPasswordRecovery) {
        const user = data.user;
        if (isNewOAuthUser(user?.created_at, user?.last_sign_in_at)) {
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
  const errorCode = isPasswordRecovery ? "reset_link_expired" : "oauth_failed";
  return NextResponse.redirect(`${origin}/login?error=${errorCode}`);
}
