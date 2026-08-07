"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

// AUTH-001 confirmPassword, AUTH-002 min 8 chars, AUTH-006 max fullName
const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(100, "El nombre es demasiado largo"),
    email: z.string().email("Ingresa un correo válido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
    role: z.enum(["worker", "employer"]),
    city: z.string().min(2, "Ingresa tu ciudad"),
    category: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

const forgotPasswordSchema = z.object({
  email: z.string().email("Ingresa un correo válido"),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ActionResult = {
  error?: string;
  success?: boolean;
  needsEmailConfirmation?: boolean;
};

/**
 * Devuelve `next` solo si es una ruta interna segura (previene open redirects).
 */
function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  if (!/^\/(?!\/)[^\\]*$/.test(value)) return null;
  return value;
}

/**
 * Origen absoluto de la request actual, para construir redirectTo de
 * enlaces de correo (reset de contraseña) — se lee del header `origin`
 * en vez de una env var fija, así funciona igual en cada preview de
 * Netlify/Vercel y en producción sin configuración adicional.
 */
function getOrigin(): string {
  const h = headers();
  const host = h.get("host");
  return (
    h.get("origin") ??
    (host ? `https://${host}` : null) ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://chambyclaudfinal.netlify.app"
  );
}

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // AUTH-004: distinguir "email no confirmado" de credenciales incorrectas
    const msg = error.message.toLowerCase();
    if (msg.includes("email not confirmed")) {
      return {
        error: "Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.",
      };
    }
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function register(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    role: formData.get("role"),
    city: formData.get("city"),
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const { fullName, email, password, role, city, category } = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        city,
        category: role === "worker" ? category : null,
      },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("user already registered")) {
      return { error: "Este correo ya está registrado. ¿Quieres ingresar?" };
    }
    return { error: "No se pudo crear la cuenta. Intenta nuevamente." };
  }

  // AUTH-003: si session es null, Supabase requiere confirmación de email
  if (!data.session) {
    return { needsEmailConfirmation: true };
  }

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

/**
 * Solicita el correo de restablecimiento de contraseña. SIEMPRE devuelve
 * el mismo resultado de éxito exista o no la cuenta — igual que hace
 * Supabase internamente para este endpoint — para no habilitar
 * enumeración de cuentas por correo electrónico.
 */
export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getOrigin()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("[requestPasswordReset]", error);
    // Mensaje genérico también en caso de error real (rate limit, etc.) —
    // nunca distinguimos "no existe la cuenta" de un fallo real.
    return { error: "No pudimos procesar la solicitud. Intenta de nuevo en unos minutos." };
  }

  return { success: true };
}

/** Reenvía el correo de confirmación de una cuenta recién registrada (AUTH-003). */
export async function resendConfirmationEmail(email: string): Promise<ActionResult> {
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return { error: "Correo inválido." };

  const supabase = createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already confirmed")) {
      return { error: "Este correo ya fue confirmado. Intenta iniciar sesión." };
    }
    if (msg.includes("rate limit") || msg.includes("security purposes")) {
      return { error: "Espera unos segundos antes de solicitar otro correo." };
    }
    return { error: "No se pudo reenviar el correo. Intenta más tarde." };
  }

  return { success: true };
}

/**
 * Establece la nueva contraseña tras seguir el enlace de recuperación.
 * Requiere una sesión activa: el enlace ya la crea vía /auth/callback
 * (exchangeCodeForSession del mismo `code` que usa el flujo OAuth) antes
 * de llegar a /reset-password.
 */
export async function updatePasswordAfterReset(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Este enlace ya no es válido o expiró. Solicita uno nuevo." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "No se pudo actualizar la contraseña. Intenta de nuevo." };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
