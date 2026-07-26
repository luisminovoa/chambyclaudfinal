"use client";

import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.42-.22-2.05H12v3.72h6.51c-.13 1.05-.85 2.65-2.44 3.72l-.02.14 3.54 2.7.25.02c2.25-2.05 3.68-5.06 3.68-8.25"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.05 7.93-2.87l-3.78-2.86c-1.01.7-2.37 1.19-4.15 1.19-3.17 0-5.87-2.05-6.83-4.9l-.14.01-3.68 2.79-.05.13C3.3 21.3 7.35 24 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.17 14.56A6.9 6.9 0 0 1 4.8 12c0-.89.16-1.75.36-2.56l-.01-.15-3.72-2.83-.12.06A11.9 11.9 0 0 0 0 12c0 1.93.47 3.76 1.31 5.38z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c2.26 0 3.78.96 4.65 1.77l3.4-3.29C17.94 1.24 15.24 0 12 0 7.35 0 3.3 2.7 1.31 6.62l3.85 2.98C6.13 6.8 8.83 4.75 12 4.75"
      />
    </svg>
  );
}

export function GoogleAuthButton() {
  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      className="btn-secondary w-full !gap-2"
    >
      <GoogleIcon />
      Continuar con Google
    </button>
  );
}
