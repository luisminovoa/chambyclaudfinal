import { describe, expect, it, vi, beforeEach } from "vitest";
import { register } from "./auth";
import { CATEGORY_NAMES } from "@/lib/categories";

/**
 * Fase C4-G9.3 — cierre de la brecha detectada en la auditoría
 * C4-G9.2.3.1: register() no validaba `category` contra CATEGORY_NAMES
 * (a diferencia de updateProfile()/createJob(), ya cerrados en Fase 2.1).
 * No existía ningún test de register() en el repo — este archivo cubre
 * únicamente esa validación, no el resto del flujo de auth.ts (fuera del
 * alcance de esta fase).
 */

vi.mock("next/navigation", () => ({ redirect: () => {} }));

interface SignUpCall {
  email: string;
  password: string;
  options: { data: Record<string, unknown> };
}

interface State {
  signUpCalls: SignUpCall[];
  signUpError: { message: string } | null;
  hasSession: boolean;
}

const state: State = {
  signUpCalls: [],
  signUpError: null,
  hasSession: true,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      signUp: async (params: SignUpCall) => {
        state.signUpCalls.push(params);
        if (state.signUpError) {
          return { data: { session: null, user: null }, error: state.signUpError };
        }
        return {
          data: {
            session: state.hasSession ? { access_token: "fake-token" } : null,
            user: { id: "new-user-id" },
          },
          error: null,
        };
      },
    },
  }),
}));

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    fullName: "Juan Pérez",
    email: "juan@example.com",
    password: "password123",
    confirmPassword: "password123",
    role: "worker",
    city: "Chiclayo",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  state.signUpCalls = [];
  state.signUpError = null;
  state.hasSession = true;
});

describe("register() — category validada contra CATEGORY_NAMES (Fase C4-G9.3)", () => {
  it("A) category ausente: comportamiento actual conservado, signUp() se ejecuta sin bloquear el registro", async () => {
    await register({}, buildFormData());
    expect(state.signUpCalls).toHaveLength(1);
  });

  it("B) category vacía (mismo tratamiento que ausente, ya colapsado por `formData.get('category') || undefined` antes de llegar a zod): comportamiento actual conservado", async () => {
    await register({}, buildFormData({ category: "" }));
    expect(state.signUpCalls).toHaveLength(1);
  });

  it("C) category presente en CATEGORY_NAMES (role=worker) es aceptada y viaja tal cual en el metadata de signUp()", async () => {
    await register({}, buildFormData({ role: "worker", category: "Electricista" }));
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.signUpCalls[0].options.data.category).toBe("Electricista");
  });

  it("D) category fuera de CATEGORY_NAMES (role=worker) se rechaza ANTES de llamar a signUp() — no se crea auth.users, no se dispara handle_new_user(), no hay efectos secundarios", async () => {
    const result = await register({}, buildFormData({ role: "worker", category: "Categoría inventada" }));
    expect(result).toEqual({ error: "Selecciona una categoría válida." });
    expect(state.signUpCalls).toHaveLength(0);
  });

  it("E) role=employer: category NUNCA se valida (se descarta a null de todas formas, mismo comportamiento ya existente) — un valor inventado no bloquea el registro", async () => {
    await register({}, buildFormData({ role: "employer", category: "Categoría inventada" }));
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.signUpCalls[0].options.data.category).toBeNull();
  });

  it("F) 'Otro' ya es un valor válido de CATEGORY_NAMES — se acepta sin ningún cambio de semántica, sin category_other", async () => {
    await register({}, buildFormData({ role: "worker", category: "Otro" }));
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.signUpCalls[0].options.data.category).toBe("Otro");
  });

  it("todo el catálogo CATEGORY_NAMES es aceptado para role=worker, uno por uno", async () => {
    for (const cat of CATEGORY_NAMES) {
      state.signUpCalls = [];
      await register({}, buildFormData({ role: "worker", category: cat }));
      expect(state.signUpCalls).toHaveLength(1);
      expect(state.signUpCalls[0].options.data.category).toBe(cat);
    }
  });
});
