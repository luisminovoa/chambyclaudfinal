import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ⚠️ DIAGNÓSTICO TEMPORAL — eliminar antes del lanzamiento final
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/dashboard";

  // Google/provider rechazó o el usuario canceló
  if (error) {
    console.error("[oauth/callback] Provider error:", { error, errorDescription });
    return NextResponse.redirect(`${origin}/login?error=oauth_cancelled`);
  }

  if (code) {
    const supabase = createClient();

    let sessionError: unknown = null;
    let sessionData: unknown = null;

    try {
      const result = await supabase.auth.exchangeCodeForSession(code);
      sessionError = result.error;
      sessionData = result.data;

      // Log completo en servidor (visible en Netlify Functions logs)
      if (result.error) {
        console.error("[oauth/callback] exchangeCodeForSession error:", {
          message: result.error.message,
          status: result.error.status,
          code: (result.error as unknown as Record<string, unknown>).code,
          name: result.error.name,
          stack: result.error.stack,
          raw: JSON.stringify(result.error),
        });
      } else {
        console.log("[oauth/callback] exchangeCodeForSession OK, user:", result.data?.user?.id);
      }
    } catch (thrown: unknown) {
      sessionError = thrown;
      console.error("[oauth/callback] exchangeCodeForSession THREW:", thrown);
    }

    // ⚠️ En vez de redirigir, mostrar el error completo en pantalla para diagnóstico
    if (sessionError) {
      const err = sessionError as Record<string, unknown>;
      const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>OAuth Debug — Chamby</title>
  <style>
    body { font-family: monospace; background: #0e1117; color: #e2e8f0; padding: 2rem; max-width: 900px; margin: 0 auto; }
    h1 { color: #f87171; font-size: 1.1rem; margin-bottom: 1.5rem; }
    .block { background: #161b27; border: 1px solid #2a3347; border-radius: 6px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
    .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .08em; color: #4a5a72; margin-bottom: 0.4rem; }
    .value { color: #fbbf24; word-break: break-all; white-space: pre-wrap; }
    .value.null { color: #4a5a72; font-style: italic; }
    .note { font-size: 0.75rem; color: #60a5fa; margin-top: 1.5rem; border-top: 1px solid #2a3347; padding-top: 1rem; }
    a { color: #818cf8; }
  </style>
</head>
<body>
  <h1>⚠️ OAuth Callback — Error de diagnóstico (TEMPORAL)</h1>

  <div class="block">
    <div class="label">Línea que falló</div>
    <div class="value">src/app/auth/callback/route.ts — exchangeCodeForSession(code)</div>
  </div>

  <div class="block">
    <div class="label">error.message</div>
    <div class="value">${String(err.message ?? "—")}</div>
  </div>

  <div class="block">
    <div class="label">error.name</div>
    <div class="value">${String(err.name ?? "—")}</div>
  </div>

  <div class="block">
    <div class="label">error.status</div>
    <div class="value">${String(err.status ?? "—")}</div>
  </div>

  <div class="block">
    <div class="label">error.code</div>
    <div class="value">${String(err.code ?? "—")}</div>
  </div>

  <div class="block">
    <div class="label">error.stack</div>
    <div class="value">${String(err.stack ?? "—")}</div>
  </div>

  <div class="block">
    <div class="label">JSON completo del error</div>
    <div class="value">${JSON.stringify(sessionError, null, 2)}</div>
  </div>

  <div class="block">
    <div class="label">URL del callback (parámetros recibidos)</div>
    <div class="value">code: ${code ? code.substring(0, 20) + "…" : "ausente"}
error_description del provider: ${errorDescription ?? "ninguno"}
next: ${next}
origin: ${origin}</div>
  </div>

  <div class="note">
    Esta página es temporal y solo existe para diagnóstico.<br>
    Comparte el contenido de esta pantalla para identificar el error exacto.
  </div>
</body>
</html>`;

      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  // Sin code ni error — callback malformado
  console.error("[oauth/callback] No code and no error in callback URL");
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
