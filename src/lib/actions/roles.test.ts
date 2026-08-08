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

  it("1. Worker normal: puede permanecer/activar Worker", async () => {
    state.roles = [{ role: "worker", active: true }];
    const result = await switchRoleAction("worker");
    expect(result).toEqual({ success: true });
    expect(state.profileUpdates).toEqual([{ role: "worker" }]);
  });

  it("1. Worker normal: NO puede convertirse en Admin (sin fila user_roles admin)", async () => {
    state.roles = [{ role: "worker", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
    expect(state.profileUpdates).toEqual([]);
    expect(state.profileRole).toBe("worker");
  });

  it("2. Worker + Employer: puede cambiar Worker -> Employer -> Worker", async () => {
    state.roles = [
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];
    expect(await switchRoleAction("employer")).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
    expect(await switchRoleAction("worker")).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");
  });

  it("3. Admin (con fila admin activa en user_roles): puede recorrer Admin -> Worker -> Employer -> Admin -> Worker -> Employer", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];

    expect(await switchRoleAction("worker")).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");

    expect(await switchRoleAction("employer")).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");

    // El paso crítico del bug reportado: volver a Admin después de haber
    // cambiado de modo debe funcionar, no solo la primera vez.
    expect(await switchRoleAction("admin")).toEqual({ success: true });
    expect(state.profileRole).toBe("admin");

    expect(await switchRoleAction("worker")).toEqual({ success: true });
    expect(state.profileRole).toBe("worker");

    expect(await switchRoleAction("employer")).toEqual({ success: true });
    expect(state.profileRole).toBe("employer");
  });

  it("4. Admin + Worker + Employer: cambiar el modo activo repetidamente NUNCA escribe en user_roles (solo en profiles.role)", async () => {
    state.profileRole = "admin";
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: true },
    ];

    await switchRoleAction("worker");
    await switchRoleAction("employer");
    await switchRoleAction("admin");
    await switchRoleAction("worker");

    // La fila user_roles(role='admin') nunca se toca al cambiar de modo:
    // el permiso admin persiste independientemente de cuántas veces se
    // alterne el modo operativo.
    expect(state.userRolesWrites).toEqual([]);
    expect(state.profileUpdates.map((u) => u.role)).toEqual(["worker", "employer", "admin", "worker"]);
  });

  it("5. Un usuario no-admin no puede auto-asignarse admin llamando switchRoleAction directamente", async () => {
    state.profileRole = "worker";
    state.roles = [{ role: "worker", active: true }];
    const result = await switchRoleAction("admin");
    expect(result).toEqual({ error: "No tienes acceso a ese rol." });
    expect(state.profileRole).toBe("worker");
  });

  it("switchRoleAction rechaza si no hay usuario autenticado", async () => {
    state.user = null;
    const result = await switchRoleAction("worker");
    expect(result).toEqual({ error: "No autenticado." });
  });

  it("getUserRoles refleja las filas activas del usuario, admin incluido", async () => {
    state.roles = [
      { role: "admin", active: true },
      { role: "worker", active: true },
      { role: "employer", active: false },
    ];
    const roles = await getUserRoles();
    expect(roles.sort()).toEqual(["admin", "worker"]);
  });
});
