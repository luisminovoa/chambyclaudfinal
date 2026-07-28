import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AUTH-007 + AUTH-008: manejo completo de errores del callback OAuth
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";

  // Google/provider rechazó o el usuario canceló
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_cancelled`);
  }

  if (code) {
    const supabase = createClient();
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
    if (sessionError) {
      return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Sin code ni error — callback malformado
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
