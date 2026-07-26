"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { login, type ActionResult } from "@/lib/actions/auth";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Ingresando..." : "Ingresar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}
      <div>
        <label htmlFor="email" className="label">
          Correo electrónico
        </label>
        <input id="email" name="email" type="email" required className="input" placeholder="tu@correo.com" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input id="password" name="password" type="password" required className="input" placeholder="••••••••" />
      </div>
<SubmitButton />

      <div className="relative py-2 text-center text-xs text-slate-400">
        <span className="relative bg-white px-2">o continúa con</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
      </div>

      <GoogleAuthButton />

      <p className="text-center text-sm text-slate-500">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-primary-700 hover:underline">
          Regístrate
        </Link>
      </p>
    </form>
  );
}
