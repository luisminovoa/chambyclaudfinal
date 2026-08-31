import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Capa 1 (early redirect) para rutas autenticadas-only. Cada una de estas
// ya tiene su propia comprobación server-side (Capa 2, la autoridad real —
// ver page.tsx de cada ruta); esta lista solo evita el round-trip extra de
// renderizar la página antes de redirigir. /messages y /notifications
// dependían únicamente de esa Capa 2 hasta ahora.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/jobs/new",
  "/admin",
  "/onboarding",
  "/messages",
  "/notifications",
];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto archivos estáticos, Next internos,
     * y el callback OAuth (necesita procesar las cookies PKCE sin interferencia).
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
