import { describe, expect, it, vi, beforeEach } from "vitest";
import { switchRoleAction, getUserRoles } from "./roles";
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
}

const state: State = {
  user: null,
  roles: [],
  profileRole: "worker",
  userRolesWrites: [],
  profileUpdates: [],
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
 * 0018_fix_admin_role_switch_rls.sql — no un mock optimista que siempre
 * aprueba. La rama `currentRoleIsAdmin` deliberadamente lee
 * `state.profileRole` ANTES de aplicar el update, igual que
 * `current_user_role()` ve el valor previo dentro de un WITH CHECK (la
 * causa raíz del bug: una subconsulta separada no ve su propio cambio a
 * mitad de sentencia). Esto es lo que permite que estos tests detecten
 * de verdad una regresión de la policy, no solo de switchRoleAction().
 */
function evaluateProfilesUpdateCheck(targetRole: string): { allowed: boolean; error?: PgError } {
  const currentRoleIsAdmin = state.profileRole === "admin";
  const hasActiveAdminRole = state.roles.some((r) => r.role === "admin" && r.active);
  const allowed =
    currentRoleIsAdmin ||
    targetRole === "worker" ||
    targetRole === "employer" ||
    (targetRole === "admin" && hasActiveAdminRole);
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
            return { eq: async () => ({ error: null }) };
          },
          insert: (payload: unknown) => {
            state.userRolesWrites.push({ op: "insert", payload });
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
          update: (payload: { role: string }) => ({
            eq: async () => {
              const check = evaluateProfilesUpdateCheck(payload.role);
              if (!check.allowed) return { error: check.error };
              state.profileUpdates.push(payload);
              state.profileRole = payload.role;
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
}

describe("switchRoleAction — reglas de negocio de roles (contra una simulación fiel de profiles_update_own, 0018)", () => {
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
    // que 0009 (V1) y ahora 0018 deben seguir bloqueando: un UPDATE crudo
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
