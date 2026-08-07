"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound } from "lucide-react";
import { updatePasswordAfterReset, type ActionResult } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const initialState: ActionResult = {};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full">
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Guardando...
        </>
      ) : (
        <>
          <KeyRound className="h-4 w-4" />
          Guardar nueva contraseña
        </>
      )}
    </button>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useFormState(updatePasswordAfterReset, initialState);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const pwdMismatch = confirm.length > 0 && pwd !== confirm;
  const pwdTooShort = pwd.length > 0 && pwd.length < 8;

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
        <label htmlFor="password" className="label">
          Nueva contraseña
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
      <div>
        <label htmlFor="confirmPassword" className="label">
          Confirmar contraseña
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPwd ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={cn("input", pwdMismatch && "border-danger-400 focus:ring-danger-400")}
          placeholder="Repite tu nueva contraseña"
        />
        {pwdMismatch && (
          <p className="mt-1 text-xs text-danger-600">Las contraseñas no coinciden</p>
        )}
      </div>
      <SubmitButton disabled={pwdMismatch || pwdTooShort} />
    </form>
  );
}
