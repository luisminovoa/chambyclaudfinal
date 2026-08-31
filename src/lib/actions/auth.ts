"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories";
import { validateLocationInput } from "@/lib/ubigeo";
import { deriveRegisterCity } from "@/lib/location";
import { safeNextPath } from "@/lib/safe-redirect";

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
    // Fase C4-G9.2.3.3: deja de exigirse `min(2)` — city ya no es
    // obligatoria a nivel de schema. RegisterForm.tsx (sin cambios en
    // esta fase) sigue enviando un valor real desde su <select> de
    // CITY_NAMES, así que el flujo actual sigue funcionando exactamente
    // igual (una cadena no vacía sigue pasando este `optional()` sin
    // problema). La razón del cambio: un futuro caller que use
    // department/province/district ya no puede garantizar una `city` no
    // vacía (p. ej. "solo departamento" deriva city=""), y profiles.city
    // es nullable (no exige NOT NULL) — no hay ninguna razón para seguir
    // rechazando esa combinación aquí. La regla de negocio real de qué
    // vale como `city` final vive en deriveRegisterCity(), no en zod.
    city: z.string().optional(),
    category: z.string().optional(),
    // Fase C4-G9.2.3.1: department/province/district son opcionales —
    // RegisterForm.tsx todavía no los envía (eso es un paso posterior,
    // fuera de esta fase), así que hoy siempre llegan `undefined` y toda
    // la lógica nueva de esta Server Action es un no-op puro para el
    // formulario actual.
    department: z.string().optional(),
    province: z.string().optional(),
    district: z.string().optional(),
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
    // Fase C4-G9.2.3.3: mismo tratamiento que category/department/etc. —
    // `formData.get()` devuelve `null` cuando el campo está ausente, y
    // `z.string().optional()` solo acepta `undefined` (no `null`); sin
    // este `|| undefined`, un caller que no envíe `city` en absoluto (ya
    // posible ahora que dejó de ser obligatoria) haría fallar el parseo
    // en vez de tratarse como "sin city histórica".
    city: formData.get("city") || undefined,
    category: formData.get("category") || undefined,
    department: formData.get("department") || undefined,
    province: formData.get("province") || undefined,
    district: formData.get("district") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const { fullName, email, password, role, city, category, department, province, district } = parsed.data;

  // Fase C4-G10.2: `next` se calcula una sola vez y se reutiliza tanto
  // para `emailRedirectTo` (más abajo) como para el redirect final de
  // sesión inmediata — mismo `safeNextPath()` ya usado en login()/el
  // redirect de éxito de este archivo, sin duplicar la validación.
  const nextPath = safeNextPath(formData.get("next"));

  // Fase C4-G9.3 (cierre de la brecha detectada en C4-G9.2.3.1): mismo
  // criterio ya usado en updateProfile()/createJob() (Fase 2.1) — zod
  // (registerSchema) solo exige que category sea un string opcional,
  // cualquier caller que se salte el <select> de RegisterForm.tsx podía
  // registrar una categoría inexistente. Se valida aquí, ANTES de
  // signUp(), para que una categoría inválida no cree la cuenta ni
  // dispare handle_new_user(). Respeta exactamente la semántica ya
  // existente más abajo (`category: role === "worker" ? category : null`):
  // para employer la categoría siempre se descarta, así que no tiene
  // sentido validarla — solo se comprueba cuando role es "worker" y
  // category viene no vacía ("Otro" ya es un valor válido de
  // CATEGORY_NAMES, sin cambios de semántica).
  if (role === "worker" && category && !CATEGORY_NAMES.includes(category)) {
    return { error: "Selecciona una categoría válida." };
  }

  // Fase C4-G9.2.3.1: mismo validateLocationInput() ya usado por
  // updateProfile()/createJob()/completeGoogleOnboarding() — ninguna
  // lógica de jerarquía nueva ni duplicada. RegisterForm.tsx todavía no
  // envía department/province/district, así que hoy los tres llegan
  // `undefined` y esto es un no-op (sin error, ubicación normalizada a
  // {department:null,province:null,district:null}). Corre ANTES de
  // signUp(): una ubicación inválida bloquea la creación de la cuenta
  // exactamente igual que una categoría inválida, sin excepciones — nunca
  // se crean cuentas parcialmente.
  const location = validateLocationInput({
    department: department ?? null,
    province: province ?? null,
    district: district ?? null,
  });
  if ("error" in location) return { error: location.error };

  // Fase C4-G9.2.3.3: `city` ya es opcional en el schema — `?? ""` cubre
  // el caso "sin city y sin ubicación" (E de C4-G9.2.3.3), que se acepta
  // explícitamente en vez de rechazarse: sin ninguna de las dos fuentes,
  // el resultado es una city vacía, nunca un error ni un valor inventado.
  const effectiveCity = deriveRegisterCity(location, city ?? "");

  const supabase = createClient();

  // Fase C4-G10.2 (cierre de la brecha detectada en C4-G10.1): signUp()
  // no especificaba `emailRedirectTo`, así que el enlace de confirmación
  // usaba el destino por defecto de Supabase (el Site URL del proyecto),
  // nunca /auth/callback — por eso exchangeCodeForSession()/
  // isNewOAuthUser() nunca corrían para un registro por email, y el
  // asistente de onboarding (ya construido y probado para Google desde
  // C4-G9.2.1/2.2) nunca se disparaba. Mismo patrón ya usado por
  // requestPasswordReset() en este mismo archivo: se construye a partir
  // de getOrigin() (dinámico, nunca un dominio fijo), nunca de una env
  // var ni de un string hardcodeado de Netlify/Vercel/localhost.
  // Fase C4-G10.5: `flow=email_signup` es una señal explícita e
  // independiente del tiempo transcurrido — isNewOAuthUser() (ventana de
  // 10s, sin cambios en esta fase) se demostró insuficiente para
  // confirmaciones de email con datos reales de producción (gaps de
  // 31.38s y 884.8s). /auth/callback la usa únicamente para decidir si
  // redirige a /onboarding; nunca se reenvía a otra URL ni se usa para
  // autorizar nada — falsificarla no tiene efecto sin un `code` de sesión
  // válido previo.
  const emailRedirectUrl = new URL(`${getOrigin()}/auth/callback`);
  emailRedirectUrl.searchParams.set("flow", "email_signup");
  if (nextPath) emailRedirectUrl.searchParams.set("next", nextPath);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectUrl.toString(),
      data: {
        full_name: fullName,
        role,
        city: effectiveCity,
        category: role === "worker" ? category : null,
        // IMPORTANTE: handle_new_user() (0001→0014, sin cambios en esta
        // fase) NO lee estas tres claves del metadata todavía — viajan
        // aquí únicamente para no perder el dato de cara a una fase
        // futura que sí actualice el trigger, pero por sí solas NO
        // terminan en profiles. La persistencia real ocurre más abajo,
        // vía UPDATE, y solo cuando existe sesión (ver comentario junto
        // a ese bloque).
        ...(location.department ? { department: location.department } : {}),
        ...(location.province ? { province: location.province } : {}),
        ...(location.district ? { district: location.district } : {}),
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
    // CASO B (sección 6/7 de C4-G9.2.3.1): sin sesión no hay `auth.uid()`
    // válido — cualquier UPDATE autenticado sobre profiles sería
    // rechazado por profiles_update_own (RLS), y usar createAdminClient()
    // aquí para saltarse esa comprobación sería exactamente el bypass que
    // esta fase prohíbe explícitamente. La ubicación elegida queda
    // únicamente en el metadata de auth.users (inerte para profiles hasta
    // que exista una fase que actualice handle_new_user(), fuera de este
    // alcance) — el usuario puede completarla luego desde su perfil, igual
    // que ya ocurre hoy con Google cuando no se elige ciudad en el
    // onboarding. No se modifica handle_new_user(), no se toca esta
    // limitación en esta fase.
    return { needsEmailConfirmation: true };
  }

  // CASO A: ya existe sesión autenticada (mismo patrón que
  // completeGoogleOnboarding(), C4-G9.2.1) — solo entonces se puede
  // persistir department/province/district en profiles, porque
  // handle_new_user() no las escribe. Se omite por completo si no se
  // envió ubicación (location.department ausente): sin esto, cada
  // registro actual (que hoy nunca envía ubicación) dispararía un UPDATE
  // vacío innecesario. `city` NO se reescribe aquí — ya quedó correcta
  // en el INSERT de handle_new_user() a partir de `effectiveCity`.
  if (location.department && data.user) {
    const { error: locationUpdateError } = await supabase
      .from("profiles")
      .update({
        department: location.department,
        province: location.province,
        district: location.district,
      })
      .eq("id", data.user.id);

    if (locationUpdateError) {
      // No se revierte auth.users ni se borra la cuenta ya creada — mismo
      // principio ya documentado en el resto de la app (nunca deshacer
      // manualmente un efecto ya confirmado). Se reporta un error claro
      // en vez de fallar silenciosamente o redirigir como si nada.
      return {
        error:
          "Tu cuenta se creó correctamente, pero no se pudo guardar tu ubicación. Puedes completarla luego desde tu perfil.",
      };
    }
  }

  redirect(nextPath ?? "/dashboard");
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
  // Fase C4-G10.5: mismo `flow=email_signup` que register() — el reenvío
  // genera un nuevo enlace de confirmación y debe apuntar a /auth/callback
  // con la misma señal, o el reenviado también fallaría en llegar a
  // /onboarding. Sin `next`: resend() no tiene contexto de destino propio.
  const resendRedirectUrl = new URL(`${getOrigin()}/auth/callback`);
  resendRedirectUrl.searchParams.set("flow", "email_signup");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: resendRedirectUrl.toString() },
  });

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
