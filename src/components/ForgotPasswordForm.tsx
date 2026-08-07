"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowLeft, MailCheck, Send } from "lucide-react";
import { requestPasswordReset, type ActionResult } from "@/lib/actions/auth";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Enviando...
        </>
      ) : (
        <>
          <Send className="h-4 w-4" />
          Enviar enlace
        </>
      )}
    </button>
  );
}

export function ForgotPasswordForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // Mismo mensaje exista o no la cuenta — evita enumeración de cuentas.
  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
          <MailCheck className="h-8 w-8 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">Revisa tu correo</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu
            contraseña.
          </p>
        </div>
        <Link href={loginHref} className="btn-ghost !px-5 !py-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Volver al login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
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
      <SubmitButton />
      <p className="text-center text-sm text-ink-muted">
        <Link
          href={loginHref}
          className="inline-flex items-center gap-1 font-bold text-primary-600 transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al login
        </Link>
      </p>
    </form>
  );
}
