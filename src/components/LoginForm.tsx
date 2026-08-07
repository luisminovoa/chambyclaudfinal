"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, LogIn, Eye, EyeOff } from "lucide-react";
import { login, type ActionResult } from "@/lib/actions/auth";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

const initialState: ActionResult = {};

const OAUTH_ERRORS: Record<string, string> = {
  oauth_cancelled: "Cancelaste el inicio de sesión con Google.",
  oauth_failed:
    "No se pudo completar el inicio de sesión con Google. Intenta de nuevo.",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Ingresando...
        </>
      ) : (
        <>
          <LogIn className="h-4 w-4" />
          Ingresar
        </>
      )}
    </button>
  );
}

export function LoginForm({ next, oauthError }: { next?: string; oauthError?: string }) {
  const [state, formAction] = useFormState(login, initialState);
  // AUTH-007: errores de Supabase OAuth que llegan en el hash de la URL
  const [hashError, setHashError] = useState<string | undefined>();
  const [showPwd, setShowPwd] = useState(false);
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error")) {
      const desc = hash.get("error_description") ?? "";
      setHashError(
        desc.includes("exchange")
          ? "Error al conectar con Google. Verifica que tu cuenta esté autorizada e intenta de nuevo."
          : "Error al iniciar sesión con Google. Intenta de nuevo."
      );
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const displayError = hashError ?? oauthError ?? state.error;

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {displayError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {displayError}
        </div>
      )}
      <div>
        <label htmlFor="email" className="label">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="tu@correo.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            required
            className="input pr-11"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-ink"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <SubmitButton />

      <div className="relative py-2 text-center text-xs font-medium text-slate-500">
        <span className="relative z-10 bg-white px-3">o continúa con</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
      </div>

      <GoogleAuthButton />

      <p className="text-center text-sm text-ink-muted">
        ¿No tienes cuenta?{" "}
        <Link
          href={registerHref}
          className="font-bold text-primary-600 transition-colors hover:text-primary-700"
        >
          Regístrate
        </Link>
      </p>
    </form>
  );
}
