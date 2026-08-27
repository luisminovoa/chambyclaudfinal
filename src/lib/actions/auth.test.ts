import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { register, deriveRegisterCity } from "./auth";
import { CATEGORY_NAMES } from "@/lib/categories";
import type { NormalizedLocation } from "@/lib/ubigeo";

/**
 * Fase C4-G9.3 — cierre de la brecha detectada en la auditoría
 * C4-G9.2.3.1: register() no validaba `category` contra CATEGORY_NAMES
 * (a diferencia de updateProfile()/createJob(), ya cerrados en Fase 2.1).
 *
 * Fase C4-G9.2.3.1 — register() ahora acepta opcionalmente
 * department/province/district, los valida con validateLocationInput()
 * (reutilizado, sin duplicar la lógica jerárquica), deriva `city` con
 * deriveRegisterCity(), y persiste la ubicación en profiles mediante un
 * UPDATE posterior SOLO cuando existe sesión inmediata (mismo patrón que
 * completeGoogleOnboarding(), C4-G9.2.1) — nunca vía createAdminClient(),
 * y sin tocar handle_new_user(). RegisterForm.tsx no cambia en esta fase:
 * todo lo relacionado con ubicación llega siempre `undefined` en tráfico
 * real hasta que se implemente un paso posterior de UI.
 */

vi.mock("next/navigation", () => ({ redirect: () => {} }));

interface SignUpCall {
  email: string;
  password: string;
  options: { data: Record<string, unknown> };
}

interface ProfileUpdateCall {
  payload: Record<string, unknown>;
  eqId: string;
}

interface State {
  signUpCalls: SignUpCall[];
  signUpError: { message: string } | null;
  hasSession: boolean;
  profileUpdateCalls: ProfileUpdateCall[];
  forceProfileUpdateError: boolean;
}

const state: State = {
  signUpCalls: [],
  signUpError: null,
  hasSession: true,
  profileUpdateCalls: [],
  forceProfileUpdateError: false,
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
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Tabla no mockeada: ${table}`);
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: async (_col: string, val: string) => {
            state.profileUpdateCalls.push({ payload, eqId: val });
            if (state.forceProfileUpdateError) {
              return { error: { message: "simulated db error" } };
            }
            return { error: null };
          },
        }),
      };
    },
  }),
  // register() NUNCA debe importar/usar createAdminClient() para persistir
  // ubicación cuando no hay sesión — si algún día lo hiciera, este mock
  // ni siquiera lo expone, así que el import fallaría en tiempo de
  // ejecución. Ver también el test estático AB) más abajo.
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
  state.profileUpdateCalls = [];
  state.forceProfileUpdateError = false;
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

describe("register() — ubicación jerárquica opcional (C4-G9.2.3.1)", () => {
  it("E) ubicación completamente ausente: signUp permitido (RegisterForm.tsx no envía estos campos hoy)", async () => {
    await register({}, buildFormData());
    expect(state.signUpCalls).toHaveLength(1);
  });

  it("F) solo department es aceptado (guardado progresivo)", async () => {
    await register({}, buildFormData({ department: "Lambayeque" }));
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.profileUpdateCalls).toEqual([
      { payload: { department: "Lambayeque", province: null, district: null }, eqId: "new-user-id" },
    ]);
  });

  it("G) department + province es aceptado", async () => {
    await register({}, buildFormData({ department: "Lambayeque", province: "Chiclayo" }));
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.profileUpdateCalls).toEqual([
      {
        payload: { department: "Lambayeque", province: "Chiclayo", district: null },
        eqId: "new-user-id",
      },
    ]);
  });

  it("H) department + province + district es aceptado", async () => {
    await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Chiclayo", district: "Pimentel" })
    );
    expect(state.signUpCalls).toHaveLength(1);
    expect(state.profileUpdateCalls).toEqual([
      {
        payload: { department: "Lambayeque", province: "Chiclayo", district: "Pimentel" },
        eqId: "new-user-id",
      },
    ]);
  });

  it("I) province sin department se rechaza ANTES de signUp()", async () => {
    const result = await register({}, buildFormData({ province: "Chiclayo" }));
    expect(result).toEqual({ error: "Selecciona un departamento antes de la provincia." });
    expect(state.signUpCalls).toHaveLength(0);
    expect(state.profileUpdateCalls).toHaveLength(0);
  });

  it("J) district sin province se rechaza ANTES de signUp()", async () => {
    const result = await register({}, buildFormData({ department: "Lambayeque", district: "Pimentel" }));
    expect(result).toEqual({ error: "Selecciona departamento y provincia antes del distrito." });
    expect(state.signUpCalls).toHaveLength(0);
  });

  it("K) province perteneciente a otro department se rechaza (Chiclayo es de Lambayeque, no de La Libertad)", async () => {
    const result = await register(
      {},
      buildFormData({ department: "La Libertad", province: "Chiclayo" })
    );
    expect("error" in result && result.error).toBeTruthy();
    expect(state.signUpCalls).toHaveLength(0);
  });

  it("L) district perteneciente a otra province se rechaza (Pimentel es de Chiclayo, no de Ferreñafe)", async () => {
    const result = await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Ferreñafe", district: "Pimentel" })
    );
    expect("error" in result && result.error).toBeTruthy();
    expect(state.signUpCalls).toHaveLength(0);
  });
});

describe("deriveRegisterCity() — derivación de city con prioridad (C4-G9.2.3.1)", () => {
  const empty: NormalizedLocation = { department: null, province: null, district: null };

  it("M) ubicación completa → city derivada del district", () => {
    const location: NormalizedLocation = {
      department: "Lambayeque",
      province: "Chiclayo",
      district: "Pimentel",
    };
    expect(deriveRegisterCity(location, "Trujillo")).toBe("Pimentel");
  });

  it("N) department + province (sin district) → city = province", () => {
    const location: NormalizedLocation = { department: "Lambayeque", province: "Chiclayo", district: null };
    expect(deriveRegisterCity(location, "Trujillo")).toBe("Chiclayo");
  });

  it("O) solo department → city vacía (no se inventa ningún valor, tampoco se conserva la city histórica)", () => {
    const location: NormalizedLocation = { department: "Lambayeque", province: null, district: null };
    expect(deriveRegisterCity(location, "Trujillo")).toBe("");
  });

  it("P) sin ubicación (department ausente) → se preserva íntegra la city histórica", () => {
    expect(deriveRegisterCity(empty, "Trujillo")).toBe("Trujillo");
  });

  it("Q) ubicación + city antigua a la vez → la ubicación nueva tiene prioridad, la city antigua se descarta", () => {
    const location: NormalizedLocation = { department: "Lambayeque", province: "Chiclayo", district: null };
    expect(deriveRegisterCity(location, "Trujillo")).toBe("Chiclayo");
    expect(deriveRegisterCity(location, "Trujillo")).not.toBe("Trujillo");
  });
});

describe("register() — metadata de signUp() (C4-G9.2.3.1)", () => {
  it("R) metadata contiene la ubicación ya validada cuando se envía completa", async () => {
    await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Chiclayo", district: "Pimentel" })
    );
    const metadata = state.signUpCalls[0].options.data;
    expect(metadata.department).toBe("Lambayeque");
    expect(metadata.province).toBe("Chiclayo");
    expect(metadata.district).toBe("Pimentel");
    // city se deriva del nivel más específico (Pimentel), no de la city
    // histórica que además viene en buildFormData() por defecto.
    expect(metadata.city).toBe("Pimentel");
  });

  it("S) metadata NO contiene claves de niveles no elegidos (solo department enviado → sin province/district en el metadata)", async () => {
    await register({}, buildFormData({ department: "Lambayeque" }));
    const metadata = state.signUpCalls[0].options.data;
    expect(metadata).toHaveProperty("department", "Lambayeque");
    expect(metadata).not.toHaveProperty("province");
    expect(metadata).not.toHaveProperty("district");
  });

  it("T) role continúa funcionando exactamente igual (worker/employer) sin interferencia de la ubicación", async () => {
    await register({}, buildFormData({ role: "employer", department: "Lambayeque", province: "Chiclayo" }));
    expect(state.signUpCalls[0].options.data.role).toBe("employer");
  });

  it("U) category continúa funcionando junto con ubicación, sin que una interfiera con la otra", async () => {
    await register(
      {},
      buildFormData({
        role: "worker",
        category: "Electricista",
        department: "Lambayeque",
        province: "Chiclayo",
      })
    );
    const metadata = state.signUpCalls[0].options.data;
    expect(metadata.category).toBe("Electricista");
    expect(metadata.department).toBe("Lambayeque");
  });
});

describe("register() — sesión y confirmación de email (C4-G9.2.3.1, sección crítica)", () => {
  it("V) data.session !== null: el UPDATE de profiles se ejecuta con department/province/district, y el flujo llega hasta el redirect final sin error", async () => {
    state.hasSession = true;
    const result = await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Chiclayo", district: "Pimentel" })
    );
    // redirect() está mockeado como no-op — el mismo criterio ya usado en
    // create-job.test.ts: la función real nunca retorna tras redirect()
    // (lanza NEXT_REDIRECT), así que no se afirma sobre `result` aquí,
    // solo sobre lo que efectivamente se ejecutó antes de esa llamada.
    void result;
    expect(state.profileUpdateCalls).toEqual([
      {
        payload: { department: "Lambayeque", province: "Chiclayo", district: "Pimentel" },
        eqId: "new-user-id",
      },
    ]);
  });

  it("W) data.session === null (confirmación de email pendiente): el UPDATE de profiles NO se ejecuta, needsEmailConfirmation es true, y la ubicación NO se pierde del metadata (aunque hoy sea inerte para profiles, sin tocar handle_new_user())", async () => {
    state.hasSession = false;
    const result = await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Chiclayo", district: "Pimentel" })
    );
    expect(result).toEqual({ needsEmailConfirmation: true });
    expect(state.profileUpdateCalls).toHaveLength(0);
    // La ubicación sí viajó en el metadata de signUp() — persistirla en
    // profiles antes de la confirmación queda fuera de esta fase (no se
    // modifica handle_new_user()).
    expect(state.signUpCalls[0].options.data.department).toBe("Lambayeque");
  });

  it("sin ubicación y sin sesión: mismo comportamiento de needsEmailConfirmation ya existente antes de esta fase (sin regresión)", async () => {
    state.hasSession = false;
    const result = await register({}, buildFormData());
    expect(result).toEqual({ needsEmailConfirmation: true });
    expect(state.profileUpdateCalls).toHaveLength(0);
  });
});

describe("register() — manejo de errores (C4-G9.2.3.1)", () => {
  it("X) error de signUp() por correo ya registrado: comportamiento actual conservado, sin llegar nunca al UPDATE de ubicación", async () => {
    state.signUpError = { message: "User already registered" };
    const result = await register({}, buildFormData({ department: "Lambayeque" }));
    expect(result).toEqual({ error: "Este correo ya está registrado. ¿Quieres ingresar?" });
    expect(state.profileUpdateCalls).toHaveLength(0);
  });

  it("X.2) error genérico de signUp(): comportamiento actual conservado", async () => {
    state.signUpError = { message: "some unexpected provider error" };
    const result = await register({}, buildFormData());
    expect(result).toEqual({ error: "No se pudo crear la cuenta. Intenta nuevamente." });
  });

  it("Y) el UPDATE de ubicación falla después de creada la cuenta: se reporta un error claro, la cuenta NO se revierte ni se borra, y no se recurre a ningún bypass administrativo", async () => {
    state.forceProfileUpdateError = true;
    const result = await register(
      {},
      buildFormData({ department: "Lambayeque", province: "Chiclayo" })
    );
    expect(result).toEqual({
      error:
        "Tu cuenta se creó correctamente, pero no se pudo guardar tu ubicación. Puedes completarla luego desde tu perfil.",
    });
    // La cuenta ya se creó (signUp() sí se llamó) — el error ocurre
    // DESPUÉS, y no dispara ningún intento de deshacer ese efecto.
    expect(state.signUpCalls).toHaveLength(1);
  });
});

describe("register() — seguridad (C4-G9.2.3.1)", () => {
  it("Z) category inválida: signUp() nunca se llama (repetido aquí junto al resto de casos de seguridad de esta fase)", async () => {
    await register({}, buildFormData({ role: "worker", category: "Categoría inventada" }));
    expect(state.signUpCalls).toHaveLength(0);
  });

  it("AA) ubicación inválida: signUp() nunca se llama", async () => {
    await register({}, buildFormData({ province: "Chiclayo" }));
    expect(state.signUpCalls).toHaveLength(0);
  });

  it("AB) auth.ts nunca importa createAdminClient() — verificación estática del código fuente, no solo del mock (un comentario explicando por qué NO se usa no cuenta como uso real, por eso se busca específicamente el import, no cualquier mención del nombre)", () => {
    const source = readFileSync(new URL("./auth.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/import\s*\{[^}]*\bcreateAdminClient\b[^}]*\}\s*from/);
  });
});
