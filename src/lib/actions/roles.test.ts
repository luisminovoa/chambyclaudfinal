import { describe, expect, it, vi, beforeEach } from "vitest";
import { switchRoleAction, getUserRoles } from "./roles";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

interface RoleRow {
  role: string;
  active: boolean;
}

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
          update: (payload: { role: string }) => {
            state.profileUpdates.push(payload);
            state.profileRole = payload.role;
            return { eq: async () => ({ error: null }) };
          },
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

describe("switchRoleAction — reglas de negocio de roles", () => {
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

  it("3. worker -> admin cuando la cuenta tiene admin activo en user_roles", async () => {
    state.roles = [
      { role: "worker", active: true },
      { role: "admin", active: true },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("4. employer -> admin cuando la cuenta tiene admin activo en user_roles", async () => {
    state.profileRole = "employer";
    state.roles = [
      { role: "employer", active: true },
      { role: "admin", active: true },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("5. admin -> worker", async () => {
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

  it("6. admin -> employer", async () => {
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

  it("7. admin -> admin (permanecer en el mismo modo no falla)", async () => {
    state.profileRole = "admin";
    state.roles = [{ role: "admin", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");
  });

  it("8. usuario sin admin activo -> admin debe fallar (no puede auto-asignarse)", async () => {
    state.profileRole = "worker";
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
    expect(state.profileRole).toBe("worker");
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

    // Ninguna de esas 5 transiciones tocó user_roles: el permiso admin
    // (y worker/employer) siguen intactos independientemente de cuántas
    // veces se alterne el modo operativo.
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
});
