"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Search, Briefcase, UserPlus, MailCheck, Eye, EyeOff } from "lucide-react";
import { register, type ActionResult } from "@/lib/actions/auth";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full">
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

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(register, initialState);
  const [role, setRole] = useState<"worker" | "employer">("worker");
  // AUTH-001: estado para validación client-side de contraseñas
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const pwdMismatch = confirm.length > 0 && pwd !== confirm;
  const pwdTooShort = pwd.length > 0 && pwd.length < 8;

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // AUTH-003: confirmar email pendiente
  if (state.needsEmailConfirmation) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
          <MailCheck className="h-8 w-8 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">Revisa tu correo</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Te enviamos un enlace de confirmación. Haz clic en él para activar tu cuenta.
          </p>
        </div>
        <Link href="/login" className="btn-ghost !min-h-0 !px-5 !py-2 text-sm">
          Ir al login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {/* Rol */}
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

      {/* Nombre */}
      <div>
        <label htmlFor="fullName" className="label">
          Nombre completo
        </label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          maxLength={100}
          className="input"
          placeholder="Juan Pérez"
        />
      </div>

      {/* Email */}
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

      {/* Contraseña — AUTH-002: mínimo 8 chars */}
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className={cn("input pr-11", pwdTooShort && "border-warning-400 focus:ring-warning-400")}
            placeholder="Mínimo 8 caracteres"
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
        {pwdTooShort && (
          <p className="mt-1 text-xs text-warning-600">
            La contraseña debe tener al menos 8 caracteres
          </p>
        )}
      </div>

      {/* Confirmar contraseña — AUTH-001 */}
      <div>
        <label htmlFor="confirmPassword" className="label">
          Confirmar contraseña
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPwd ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={cn("input pr-11", pwdMismatch && "border-danger-400 focus:ring-danger-400")}
            placeholder="Repite tu contraseña"
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
        {pwdMismatch && (
          <p className="mt-1 text-xs text-danger-600">Las contraseñas no coinciden</p>
        )}
      </div>

      {/* Ciudad */}
      <div>
        <label htmlFor="city" className="label">
          Ciudad
        </label>
        <input id="city" name="city" required className="input" placeholder="Lima" />
      </div>

      {/* Categoría (solo worker) */}
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

      <SubmitButton disabled={pwdMismatch || pwdTooShort} />

      <div className="relative py-2 text-center text-xs font-medium text-slate-500">
        <span className="relative z-10 bg-white px-3">o continúa con</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
      </div>

      <GoogleAuthButton />

      <p className="text-center text-sm text-ink-muted">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={loginHref}
          className="font-bold text-primary-600 transition-colors hover:text-primary-700"
        >
          Ingresa
        </Link>
      </p>
    </form>
  );
}
