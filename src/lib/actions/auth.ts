"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Ingresa tu nombre completo"),
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  role: z.enum(["worker", "employer"]),
  city: z.string().min(2, "Selecciona tu ciudad"),
  category: z.string().optional(),
});

export type ActionResult = { error?: string; success?: boolean };

/**
 * Devuelve `next` solo si es una ruta interna segura: empieza con un único
 * "/" (sin "//" ni "\", que el navegador interpretaría como URL absoluta
 * hacia otro dominio) y tiene un largo razonable. Cualquier otro valor se
 * descarta para evitar open redirects.
 */
function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  if (!/^\/(?!\/)[^\\]*$/.test(value)) return null;
  return value;
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
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function register(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    city: formData.get("city"),
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const { fullName, email, password, role, city, category } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
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
    if (error.message.includes("already registered")) {
      return { error: "Este correo ya está registrado." };
    }
    return { error: "No se pudo crear la cuenta. Intenta nuevamente." };
  }

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
