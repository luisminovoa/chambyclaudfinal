import { describe, expect, it, vi, beforeEach } from "vitest";
import { switchRoleAction, getUserRoles, completeGoogleOnboarding } from "./roles";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

interface RoleRow {
  role: string;
  active: boolean;
}

interface PgError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

const RLS_VIOLATION: PgError = {
  code: "42501",
  message: 'new row violates row-level security policy for table "profiles"',
  details: null,
  hint: null,
};

interface State {
  user: { id: string } | null;
  roles: RoleRow[];
  profileRole: string;
  userRolesWrites: { op: "update" | "insert"; payload: unknown }[];
  profileUpdates: { role: string }[];
  // Antes de C4-G9.2.1 este UPDATE solo podía llevar `city`; ahora puede
  // incluir además department/province/district en la misma escritura —
  // se amplía el tipo, no se cambia su nombre, para no reescribir cada
  // aserción existente que ya usa `cityUpdates`.
  cityUpdates: Record<string, string>[];
  /** Fase C4-G9.2.1 (test M): simula un error de BD en el UPDATE de ubicación/ciudad. */
  forceLocationUpdateError: boolean;
}

const state: State = {
  user: null,
  roles: [],
  profileRole: "worker",
  userRolesWrites: [],
  profileUpdates: [],
  cityUpdates: [],
  forceLocationUpdateError: false,
};

function userRolesSelectChain(predicate: (r: RoleRow) => boolean) {
  const chain = {
    eq(col: string, val: unknown) {
      // Los mocks de fila no llevan user_id: cada test representa a un
      // único usuario, así que ese filtro siempre pasa; solo importan
      // los filtros por role/active.
      if (col === "user_id") return userRolesSelectChain(predicate);
      const prev = predicate;
      const next = (r: RoleRow) => prev(r) && (r as unknown as Record<string, unknown>)[col] === val;
      return userRolesSelectChain(next);
    },
    async maybeSingle() {
      const row = state.roles.find(predicate);
      return { data: row ? { id: `${row.role}-row`, active: row.active } : null };
    },
    then(resolve: (v: { data: { role: string }[] }) => void) {
      resolve({ data: state.roles.filter(predicate).map((r) => ({ role: r.role })) });
    },
  };
  return chain;
}

/**
 * Simula la policy `profiles_update_own` TAL COMO QUEDA tras
 * 0047_harden_profiles_is_active.sql + 0067_harden_profiles_role_switch.sql
 * — no un mock optimista que siempre aprueba. `newRole` es el `role` NUEVO
 * de la fila (si el UPDATE no toca `role`, es el modo actual).
 *
 * WITH CHECK, rama por rama (0067):
 *   1. `current_user_role() = 'admin'` — el modo ACTUAL (previo al UPDATE)
 *      es admin: puede escribir cualquier valor. Es la vía de
 *      changeUserRole() y de un admin que cambia su propio modo.
 *   2. auto-servicio worker/employer: el rol destino debe ser worker o
 *      employer Y (el rol NO cambia O existe user_roles(role = destino,
 *      active = true)). Antes de 0067 bastaba con el primer requisito, por
 *      lo que un cliente podía saltarse switchRoleAction() y ponerse un
 *      modo cuyo rol no poseía.
 *   3. auto-promoción a admin: exige user_roles(role='admin', active=true).
 *
 * `previousRole` y `current_user_role()` leen deliberadamente
 * `state.profileRole` ANTES de aplicar el update, igual que una
 * subconsulta separada dentro de un WITH CHECK ve el valor previo de la
 * fila (la causa raíz documentada en 0018). Eso permite que estos tests
 * detecten de verdad una regresión de la policy, no solo de
 * switchRoleAction().
 *
 * `is_active`: ningún UPDATE de este archivo lo escribe (su valor
 * almacenado no cambia), por lo que la igualdad que exige 0047 en las
 * ramas 2 y 3 siempre se cumple aquí. Su cobertura propia vive en
 * profile-is-active-rls.test.ts.
 *
 * `profiles_insert_own` (0067: role in ('worker','employer')) no se
 * simula: ningún código de la aplicación inserta en `profiles` (lo hace el
 * trigger handle_new_user(), SECURITY DEFINER). Su cobertura es el test SQL
 * supabase/tests/0067_harden_profiles_role_switch.test.sql.
 */
function evaluateProfilesUpdateCheck(newRole: string): { allowed: boolean; error?: PgError } {
  const previousRole = state.profileRole;
  const currentRoleIsAdmin = previousRole === "admin";
  const hasActiveRole = (role: string) => state.roles.some((r) => r.role === role && r.active);
  const allowed =
    currentRoleIsAdmin ||
    ((newRole === "worker" || newRole === "employer") &&
      (newRole === previousRole || hasActiveRole(newRole))) ||
    (newRole === "admin" && hasActiveRole("admin"));
  return allowed ? { allowed: true } : { allowed: false, error: RLS_VIOLATION };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => userRolesSelectChain(() => true),
          update: (payload: unknown) => {
            state.userRolesWrites.push({ op: "update", payload });
            return {
              eq: async (col: string, val: unknown) => {
                // Efecto real del UPDATE sobre la fila (los mocks de fila
                // usan id `${role}-row`): necesario para que el orden
                // "reactivar el rol y LUEGO cambiar de modo" sea observable
                // por la policy simulada de profiles.
                const active = (payload as { active?: boolean }).active;
                if (col === "id" && typeof active === "boolean") {
                  const row = state.roles.find((r) => `${r.role}-row` === val);
                  if (row) row.active = active;
                }
                return { error: null };
              },
            };
          },
          insert: (payload: unknown) => {
            state.userRolesWrites.push({ op: "insert", payload });
            // Efecto real del INSERT (user_roles.active default true): la
            // fila nueva existe para los pasos siguientes, igual que en BD.
            const role = (payload as { role?: string }).role;
            if (role && !state.roles.some((r) => r.role === role)) state.roles.push({ role, active: true });
            return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role: state.profileRole } }),
            }),
          }),
          update: (payload: { role: string } | Record<string, string>) => ({
            eq: async () => {
              if ("role" in payload) {
                const rolePayload = payload as { role: string };
                const check = evaluateProfilesUpdateCheck(rolePayload.role);
                if (!check.allowed) return { error: check.error };
                state.profileUpdates.push(rolePayload);
                state.profileRole = rolePayload.role;
                return { error: null };
              }
              if (state.forceLocationUpdateError) {
                return { error: { code: "XXOOO", message: "simulated db error" } };
              }
              // Un UPDATE que no toca `role` también pasa por el WITH CHECK
              // (0067): el rol no cambia, así que una cuenta cuyo modo no
              // tiene fila activa NO queda bloqueada para editar su perfil.
              const check = evaluateProfilesUpdateCheck(state.profileRole);
              if (!check.allowed) return { error: check.error };
              state.cityUpdates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
}));

function reset() {
  state.user = { id: "user-1" };
  state.roles = [];
  state.profileRole = "worker";
  state.userRolesWrites = [];
  state.profileUpdates = [];
  state.cityUpdates = [];
  state.forceLocationUpdateError = false;
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("switchRoleAction — reglas de negocio de roles (contra una simulación fiel de profiles_update_own, 0047 + 0067)", () => {
  beforeEach(reset);

  it("1. worker -> employer (cuenta con ambos activos)", async () => {
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    const result = await switchRoleAction("employer");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
  });

  it("2. employer -> worker (cuenta con ambos activos)", async () => {
    state.profileRole = "employer";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    const result = await switchRoleAction("worker");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");
  });

  it("A. admin -> worker = permitido", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    const result = await switchRoleAction("worker");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");
  });

  it("B. admin -> employer = permitido", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    const result = await switchRoleAction("employer");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
  });

  it("C. worker con admin activo -> admin = permitido (el caso que estaba roto: code 42501 antes de 0018)", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: true },
      { role: "admin", active: true },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("D. employer con admin activo -> admin = permitido (el caso que estaba roto: code 42501 antes de 0018)", async () => {
    state.profileRole = "employer";
    state.roles = [
      { role: "employer", active: true },
      { role: "admin", active: true },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("E. worker sin admin activo -> admin = DENEGADO", async () => {
    state.profileRole = "worker";
    state.roles = [{ role: "worker", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
    expect(state.profileRole).toBe("worker");
  });

  it("F. employer sin admin activo -> admin = DENEGADO", async () => {
    state.profileRole = "employer";
    state.roles = [{ role: "employer", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
    expect(state.profileRole).toBe("employer");
  });

  it("F.bis employer con admin=false explícito (fila existe pero inactiva) -> admin = DENEGADO", async () => {
    state.profileRole = "employer";
    state.roles = [
      { role: "employer", active: true },
      { role: "admin", active: false },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
  });

  it("G. usuario normal intentando modificar profiles.role a 'admin' DIRECTAMENTE (saltándose switchRoleAction) = DENEGADO por la policy", async () => {
    // No pasa por switchRoleAction() en absoluto — es exactamente el ataque
    // que 0009 (V1), 0018 (históricas) y la policy vigente (0047, más 0067
    // si está aplicada) deben seguir bloqueando: un UPDATE crudo
    // contra profiles, como lo haría un cliente que se salta la Server
    // Action y llama a Supabase directamente con su propia sesión.
    state.profileRole = "worker";
    state.roles = [{ role: "worker", active: true }];

    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "admin" }).eq("id", "user-1");

    expect(error).toEqual(RLS_VIOLATION);
    expect(state.profileRole).toBe("worker");
    expect(state.profileUpdates).toEqual([]);
  });

  // ── 0067: el cambio de modo exige poseer el rol destino ACTIVO también por
  // la vía directa (PATCH /rest/v1/profiles), sin pasar por switchRoleAction().
  // Casos A3/A4/A5 de supabase/tests/0067_harden_profiles_role_switch.test.sql;
  // el comportamiento real contra Postgres lo prueba ese test SQL.

  it("G.2 (A3) worker PURO pone profiles.role='employer' DIRECTAMENTE sin fila employer = DENEGADO por la policy (0067)", async () => {
    state.profileRole = "worker";
    state.roles = [{ role: "worker", active: true }];

    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "employer" }).eq("id", "user-1");

    expect(error).toEqual(RLS_VIOLATION);
    expect(state.profileRole).toBe("worker");
    expect(state.profileUpdates).toEqual([]);
  });

  it("G.3 (A4) employer PURO pone profiles.role='worker' DIRECTAMENTE sin fila worker = DENEGADO por la policy (0067)", async () => {
    state.profileRole = "employer";
    state.roles = [{ role: "employer", active: true }];

    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "worker" }).eq("id", "user-1");

    expect(error).toEqual(RLS_VIOLATION);
    expect(state.profileRole).toBe("employer");
    expect(state.profileUpdates).toEqual([]);
  });

  it("G.4 (A5) worker con employer INACTIVO pone profiles.role='employer' DIRECTAMENTE = DENEGADO por la policy (0067)", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: false },
    ];

    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "employer" }).eq("id", "user-1");

    expect(error).toEqual(RLS_VIOLATION);
    expect(state.profileRole).toBe("worker");
    expect(state.profileUpdates).toEqual([]);
  });

  it("G.5 cuenta con ambos roles activos cambia de modo DIRECTAMENTE = permitido (el cambio legítimo no se rompe)", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];

    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "employer" }).eq("id", "user-1");

    expect(error).toBeNull();
    expect(state.profileRole).toBe("employer");
  });

  it("G.6 modo cuyo rol está inactivo: re-escribir el MISMO rol o editar el perfil NO se bloquea (rol sin cambio, estado preexistente)", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: false },
      { role: "employer", active: true },
    ];

    const supabase = createClient();
    const sameRole = await supabase.from("profiles").update({ role: "worker" }).eq("id", "user-1");
    const otherField = await supabase.from("profiles").update({ city: "Lima" }).eq("id", "user-1");

    expect(sameRole.error).toBeNull();
    expect(otherField.error).toBeNull();
    expect(state.cityUpdates).toEqual([{ city: "Lima" }]);
    expect(state.profileRole).toBe("worker");
  });

  it("G.7 un rol INACTIVO no sirve de destino aunque haya sido el modo anterior: employer -> worker (inactivo) = DENEGADO", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: false },
      { role: "employer", active: true },
    ];
    // el destino 'employer' SÍ lo posee (activo); el origen 'worker' está inactivo
    const supabase = createClient();
    const allowed = await supabase.from("profiles").update({ role: "employer" }).eq("id", "user-1");
    expect(allowed.error).toBeNull();
    // ya en employer, volver a 'worker' (inactivo) se rechaza
    const denied = await supabase.from("profiles").update({ role: "worker" }).eq("id", "user-1");
    expect(denied.error).toEqual(RLS_VIOLATION);
    expect(state.profileRole).toBe("employer");
  });

  it("H. admin -> worker -> admin = permitido", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
    ];
    expect(await switchRoleAction("worker")).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");
    expect(await switchRoleAction("admin")).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("I. admin -> employer -> admin = permitido", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "employer", active: true },
    ];
    expect(await switchRoleAction("employer")).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
    expect(await switchRoleAction("admin")).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("J. worker -> employer -> worker -> admin = permitido si posee admin activo", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
      { role: "admin", active: true },
    ];
    expect(await switchRoleAction("employer")).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
    expect(await switchRoleAction("worker")).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");
    expect(await switchRoleAction("admin")).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("7. admin -> admin (permanecer en el mismo modo no falla)", async () => {
    state.profileRole = "admin";
    state.roles = [{ role: "admin", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("9. admin activo permanece activo en user_roles al cambiar a worker (switchRoleAction nunca escribe user_roles)", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
    ];
    await switchRoleAction("worker");
    expect(state.userRolesWrites).toEqual([]);
    expect(state.roles.find((r) => r.role === "admin")?.active).toBe(true);
  });

  it("10. admin activo permanece activo en user_roles al cambiar a employer (switchRoleAction nunca escribe user_roles)", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "employer", active: true },
    ];
    await switchRoleAction("employer");
    expect(state.userRolesWrites).toEqual([]);
    expect(state.roles.find((r) => r.role === "admin")?.active).toBe(true);
  });

  it("admin con los 3 roles puede recorrer admin -> worker -> employer -> admin -> worker -> employer sin perder ningún permiso", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];

    for (const target of ["worker", "employer", "admin", "worker", "employer"] as const) {
      const result = await switchRoleAction(target);
      expect(result).toEqual({ success: true });
      expect(state.profileRole).toBe(target);
    }

    expect(state.userRolesWrites).toEqual([]);
  });

  it("switchRoleAction rechaza si no hay usuario autenticado", async () => {
    state.user = null;
    const result = await switchRoleAction("worker");
    expect(result).toEqual({ error: "No autenticado." });
  });

  it("getUserRoles refleja las filas activas del usuario (usa `active`, no `is_active`), admin incluido", async () => {
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: false },
    ];
    const roles = await getUserRoles();
    expect(roles.sort()).toEqual(["admin", "worker"]);
  });

  it("reproducción exacta del bug reportado: worker=true, employer=true, admin=true, estado inicial profiles.role='admin' — recorre admin->worker->admin->employer->admin->worker->employer->worker sin perder ningún active=true ni devolver 'No tienes acceso a ese rol.'", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
      { role: "admin", active: true },
    ];

    const sequence = [
      "worker",
      "admin",
      "employer",
      "admin",
      "worker",
      "employer",
      "worker",
    ] as const;

    for (const target of sequence) {
      const result = await switchRoleAction(target);
      expect(result).not.toEqual({ error: "No tienes acceso a ese rol." });
      expect(result).toEqual({ success: true });
      expect(state.profileRole).toBe(target);
      expect(state.roles.every((r) => r.active)).toBe(true);
    }

    expect(state.userRolesWrites).toEqual([]);
  });
});

describe("completeGoogleOnboarding — normalización de ciudad (Fase C4-F)", () => {
  beforeEach(reset);

  it("ciudad ausente/vacía: no se ejecuta ningún UPDATE de city (sigue siendo opcional)", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker" }));
    expect(state.cityUpdates).toEqual([]);
  });

  it("ciudad ya canónica ('Chiclayo') se guarda tal cual", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: "Chiclayo" }));
    expect(state.cityUpdates).toEqual([{ city: "Chiclayo" }]);
  });

  it("variante de mayúsculas ('CHICLAYO') se normaliza server-side a 'Chiclayo' antes de guardar", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: "CHICLAYO" }));
    expect(state.cityUpdates).toEqual([{ city: "Chiclayo" }]);
  });

  it("variante con espacios (' trujillo ') se normaliza a 'Trujillo'", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: " trujillo " }));
    expect(state.cityUpdates).toEqual([{ city: "Trujillo" }]);
  });

  it("G) una ciudad fuera del catálogo ('Lima') nunca se guarda silenciosamente como Chiclayo/Trujillo — se conserva tal cual, sin inventar", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: "Lima" }));
    expect(state.cityUpdates).toEqual([{ city: "Lima" }]);
  });

  it("intent=employer sigue activando el modo empleador exactamente igual, sin interferencia de la normalización de ciudad", async () => {
    state.roles = [{ role: "employer", active: true }];
    await completeGoogleOnboarding({}, makeFormData({ intent: "employer", city: "CHICLAYO" }));
    expect(state.profileUpdates).toEqual([{ role: "employer" }]);
    expect(state.cityUpdates).toEqual([{ city: "Chiclayo" }]);
  });

  it("0067 onboarding (worker puro, intent=employer): enableEmployerRole() agrega el rol ANTES de cambiar el modo — el orden que exige la policy", async () => {
    state.roles = [{ role: "worker", active: true }];
    await completeGoogleOnboarding({}, makeFormData({ intent: "employer", city: "Chiclayo" }));
    expect(state.userRolesWrites).toEqual([{ op: "insert", payload: { user_id: "user-1", role: "employer" } }]);
    expect(state.profileUpdates).toEqual([{ role: "employer" }]);
    expect(state.profileRole).toBe("employer");
    expect(state.cityUpdates).toEqual([{ city: "Chiclayo" }]);
  });

  it("0067 onboarding (rol employer INACTIVO, intent=employer): lo reactiva y LUEGO cambia el modo", async () => {
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: false },
    ];
    await completeGoogleOnboarding({}, makeFormData({ intent: "employer" }));
    expect(state.userRolesWrites).toEqual([{ op: "update", payload: { active: true } }]);
    expect(state.profileUpdates).toEqual([{ role: "employer" }]);
    expect(state.profileRole).toBe("employer");
  });

  it("intent inválido/ausente se rechaza antes de tocar city", async () => {
    const result = await completeGoogleOnboarding({}, makeFormData({ city: "Chiclayo" }));
    expect(result).toEqual({ error: "Selecciona una opción para continuar." });
    expect(state.cityUpdates).toEqual([]);
  });

  it("sin usuario autenticado se rechaza antes de tocar city", async () => {
    state.user = null;
    const result = await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: "Chiclayo" }));
    expect(result).toEqual({ error: "No autenticado." });
    expect(state.cityUpdates).toEqual([]);
  });
});

describe("completeGoogleOnboarding — ubicación jerárquica opcional (C4-G9.2.1, Paso 1 de C4-G9.2)", () => {
  beforeEach(reset);

  // redirect() real de Next.js aborta lanzando NEXT_REDIRECT; el mock de
  // next/navigation es un no-op (mismo criterio ya documentado en
  // create-job.test.ts), así que en el camino de éxito la función
  // simplemente termina sin valor de retorno explícito tras el redirect —
  // por eso estos tests no afirman sobre `result`, solo sobre lo que
  // efectivamente quedó en `state.cityUpdates`.

  it("A) ubicación completamente ausente: comportamiento actual conservado (sin department/province/district, solo intent)", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker" }));
    expect(state.cityUpdates).toEqual([]);
  });

  it("B) solo department es aceptado (guardado progresivo)", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", department: "Lambayeque" }));
    expect(state.cityUpdates).toEqual([{ department: "Lambayeque" }]);
  });

  it("C) department + province es aceptado", async () => {
    await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", department: "Lambayeque", province: "Chiclayo" })
    );
    expect(state.cityUpdates).toEqual([{ department: "Lambayeque", province: "Chiclayo" }]);
  });

  it("D) department + province + district es aceptado", async () => {
    await completeGoogleOnboarding(
      {},
      makeFormData({
        intent: "worker",
        department: "Lambayeque",
        province: "Chiclayo",
        district: "Pimentel",
      })
    );
    expect(state.cityUpdates).toEqual([
      { department: "Lambayeque", province: "Chiclayo", district: "Pimentel" },
    ]);
  });

  it("E) province sin department se rechaza, sin escribir nada en profiles", async () => {
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", province: "Chiclayo" })
    );
    expect(result).toEqual({ error: "Selecciona un departamento antes de la provincia." });
    expect(state.cityUpdates).toEqual([]);
  });

  it("F) district sin province se rechaza, sin escribir nada en profiles", async () => {
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", department: "Lambayeque", district: "Pimentel" })
    );
    expect(result).toEqual({ error: "Selecciona departamento y provincia antes del distrito." });
    expect(state.cityUpdates).toEqual([]);
  });

  it("G) province perteneciente a otro department se rechaza (Chiclayo es de Lambayeque, no de La Libertad)", async () => {
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", department: "La Libertad", province: "Chiclayo" })
    );
    expect("error" in result && result.error).toBeTruthy();
    expect(state.cityUpdates).toEqual([]);
  });

  it("H) district perteneciente a otra province se rechaza (Pimentel es de Chiclayo, no de Ferreñafe)", async () => {
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({
        intent: "worker",
        department: "Lambayeque",
        province: "Ferreñafe",
        district: "Pimentel",
      })
    );
    expect("error" in result && result.error).toBeTruthy();
    expect(state.cityUpdates).toEqual([]);
  });

  it("I) ubicación válida junto con city: profiles recibe los cuatro valores correctos en un solo UPDATE", async () => {
    await completeGoogleOnboarding(
      {},
      makeFormData({
        intent: "worker",
        city: "Chiclayo",
        department: "Lambayeque",
        province: "Chiclayo",
        district: "Pimentel",
      })
    );
    expect(state.cityUpdates).toEqual([
      { city: "Chiclayo", department: "Lambayeque", province: "Chiclayo", district: "Pimentel" },
    ]);
  });

  it("J) solo city (sin ubicación jerárquica), como hoy envía RoleOnboardingForm.tsx: comportamiento actual conservado exactamente", async () => {
    await completeGoogleOnboarding({}, makeFormData({ intent: "worker", city: "CHICLAYO" }));
    expect(state.cityUpdates).toEqual([{ city: "Chiclayo" }]);
  });

  it("K) intent=employer sigue activando el rol y el modo activo exactamente igual, sin interferencia de la ubicación jerárquica", async () => {
    state.roles = [{ role: "employer", active: true }];
    await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "employer", department: "Lambayeque", province: "Chiclayo" })
    );
    expect(state.profileUpdates).toEqual([{ role: "employer" }]);
    expect(state.cityUpdates).toEqual([{ department: "Lambayeque", province: "Chiclayo" }]);
  });

  it("L) sin usuario autenticado se rechaza antes de validar o tocar ninguna ubicación", async () => {
    state.user = null;
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", department: "Lambayeque" })
    );
    expect(result).toEqual({ error: "No autenticado." });
    expect(state.cityUpdates).toEqual([]);
  });

  it("M) un error de BD en el UPDATE de ubicación/ciudad se propaga con el mismo mensaje que ya usaba el flujo de solo-ciudad", async () => {
    state.forceLocationUpdateError = true;
    const result = await completeGoogleOnboarding(
      {},
      makeFormData({ intent: "worker", department: "Lambayeque" })
    );
    expect(result).toEqual({
      error: "No se pudo guardar tu ciudad, pero tu cuenta ya está lista.",
    });
  });
});
