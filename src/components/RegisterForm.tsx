"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Search, Briefcase, UserPlus } from "lucide-react";
import { register, type ActionResult } from "@/lib/actions/auth";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Creando cuenta...
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" />
          Crear cuenta
        </>
      )}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useFormState(register, initialState);
  const [role, setRole] = useState<"worker" | "employer">("worker");

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
        <label className="label">Quiero...</label>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de cuenta">
          {(
            [
              { value: "worker", label: "Buscar trabajo", icon: Search },
              { value: "employer", label: "Contratar", icon: Briefcase },
            ] as const
          ).map((opt) => (
            <motion.button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={role === opt.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => setRole(opt.value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-4 text-sm font-semibold transition-all duration-200",
                role === opt.value
                  ? "border-primary-600 bg-primary-50 text-primary-700 shadow-glow-sm"
                  : "border-slate-200 text-ink-muted hover:border-slate-300"
              )}
            >
              <opt.icon className="h-5 w-5" />
              {opt.label}
            </motion.button>
          ))}
        </div>
        <input type="hidden" name="role" value={role} />
      </div>

      <div>
        <label htmlFor="fullName" className="label">
          Nombre completo
        </label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          className="input"
          placeholder="Juan Pérez"
        />
      </div>

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
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="input"
          placeholder="Mínimo 6 caracteres"
        />
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
          <input
            id="category"
            name="category"
            className="input"
            placeholder="Electricista, niñera, albañil..."
          />
        </div>
      )}

      <SubmitButton />

      <div className="relative py-2 text-center text-xs font-medium text-slate-500">
        <span className="relative z-10 bg-white px-3">o continúa con</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
      </div>

      <GoogleAuthButton />

      <p className="text-center text-sm text-ink-muted">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-bold text-primary-600 transition-colors hover:text-primary-700"
        >
          Ingresa
        </Link>
      </p>
    </form>
  );
}
