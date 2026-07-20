"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { register, type ActionResult } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Creando cuenta..." : "Crear cuenta"}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useFormState(register, initialState);
  const [role, setRole] = useState<"worker" | "employer">("worker");

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      <div>
        <label className="label">Quiero...</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRole("worker")}
            className={cn(
              "rounded-xl border-2 px-4 py-3 text-sm font-medium",
              role === "worker" ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"
            )}
          >
            Buscar trabajo
          </button>
          <button
            type="button"
            onClick={() => setRole("employer")}
            className={cn(
              "rounded-xl border-2 px-4 py-3 text-sm font-medium",
              role === "employer" ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"
            )}
          >
            Contratar
          </button>
        </div>
        <input type="hidden" name="role" value={role} />
      </div>

      <div>
        <label htmlFor="fullName" className="label">
          Nombre completo
        </label>
        <input id="fullName" name="fullName" required className="input" placeholder="Juan Pérez" />
      </div>

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
        <input id="password" name="password" type="password" required minLength={6} className="input" placeholder="Mínimo 6 caracteres" />
      </div>

      <div>
        <label htmlFor="city" className="label">
          Ciudad
        </label>
        <input id="city" name="city" required className="input" placeholder="Lima" />
      </div>

      {role === "worker" && (
        <div>
          <label htmlFor="category" className="label">
            Puesto / oficio principal
          </label>
          <input id="category" name="category" className="input" placeholder="Electricista, niñera, albañil..." />
        </div>
      )}

      <SubmitButton />
      <p className="text-center text-sm text-slate-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary-700 hover:underline">
          Ingresa
        </Link>
      </p>
    </form>
  );
}
