import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";

  // Google/provider rejected or user cancelled
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

  // No code and no error — malformed callback
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
