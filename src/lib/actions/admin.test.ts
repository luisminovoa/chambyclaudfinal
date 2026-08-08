import { describe, expect, it, vi, beforeEach } from "vitest";
import { reviewVerificationDocument, changeUserRole } from "./admin";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const computeAndSaveProfileStats = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/profile", () => ({
  computeAndSaveProfileStats: (...args: unknown[]) => computeAndSaveProfileStats(...args),
}));

interface AdminUserRoleRow {
  id: string;
  role: string;
  active: boolean;
}

interface State {
  user: { id: string } | null;
  profileRole: string | null;
  updateResult: { data: unknown; error: { message: string } | null };
  profileUpdates: { userId: string; role: string }[];
  targetUserRoles: AdminUserRoleRow[];
  adminUserRolesWrites: { op: "update" | "insert"; payload: unknown; match?: Record<string, unknown> }[];
}

const state: State = {
  user: null,
  profileRole: null,
  updateResult: { data: null, error: null },
  profileUpdates: [],
  targetUserRoles: [],
  adminUserRolesWrites: [],
};

function makeUpdateChain() {
  return {
    update: () => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => state.updateResult,
          }),
        }),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: state.profileRole ? { role: state.profileRole } : null }),
            }),
          }),
          update: (payload: { role: string }) => ({
            eq: async (_col: string, userId: string) => {
              state.profileUpdates.push({ userId, role: payload.role });
              return { error: null };
            },
          }),
        };
      }
      if (table === "verification_documents") {
        return makeUpdateChain();
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
  // Cliente service-role: solo changeUserRole() lo usa, para sincronizar
  // user_roles(role='admin') saltándose las policies que bloquean esa
  // fila para el cliente autenticado normal (0014_multi_role.sql).
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "user_roles") throw new Error(`Tabla no mockeada (admin client): ${table}`);

      function selectChain(match: Record<string, unknown>) {
        return {
          eq: (col: string, val: unknown) => selectChain({ ...match, [col]: val }),
          maybeSingle: async () => {
            const row = state.targetUserRoles.find((r) => match.role === undefined || r.role === match.role);
            return { data: row ? { id: row.id, active: row.active } : null };
          },
        };
      }

      function updateChain(payload: { active: boolean }, match: Record<string, unknown>) {
        const apply = () => {
          state.adminUserRolesWrites.push({ op: "update", payload, match });
          const row =
            match.id !== undefined
              ? state.targetUserRoles.find((r) => r.id === match.id)
              : state.targetUserRoles.find((r) => r.role === match.role);
          if (row) row.active = payload.active;
          return { error: null };
        };
        return {
          eq: (col: string, val: unknown) => updateChain(payload, { ...match, [col]: val }),
          then: (resolve: (v: { error: null }) => void) => resolve(apply()),
        };
      }

      return {
        select: () => selectChain({}),
        update: (payload: { active: boolean }) => updateChain(payload, {}),
        insert: (payload: { user_id: string; role: string }) => {
          state.adminUserRolesWrites.push({ op: "insert", payload });
          state.targetUserRoles.push({ id: `${payload.role}-row`, role: payload.role, active: true });
          return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
        },
      };
    },
  }),
}));

const PENDING_DOC_ID = "doc-1";

describe("reviewVerificationDocument", () => {
  beforeEach(() => {
    state.user = { id: "admin-1" };
    state.profileRole = "admin";
    state.updateResult = { data: { profile_id: "worker-1" }, error: null };
    computeAndSaveProfileStats.mockClear();
  });

  it("rechaza sin motivo: error de validación, sin tocar la base de datos", async () => {
    const result = await reviewVerificationDocument(PENDING_DOC_ID, "rejected");
    expect(result.error).toBe("Selecciona un motivo de rechazo.");
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });

  it("un trabajador no puede revisar documentos: assertAdmin lanza y no hay UPDATE", async () => {
    state.profileRole = "worker";
    await expect(reviewVerificationDocument(PENDING_DOC_ID, "verified")).rejects.toThrow("No autorizado");
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });

  it("un empleador no puede revisar documentos: assertAdmin lanza y no hay UPDATE", async () => {
    state.profileRole = "employer";
    await expect(reviewVerificationDocument(PENDING_DOC_ID, "verified")).rejects.toThrow("No autorizado");
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });

  it("usuario no autenticado: assertAdmin lanza antes de cualquier consulta a documentos", async () => {
    state.user = null;
    await expect(reviewVerificationDocument(PENDING_DOC_ID, "verified")).rejects.toThrow("No autenticado");
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });

  it("aprobación exitosa: recalcula badges/trust score del dueño del documento", async () => {
    const result = await reviewVerificationDocument(PENDING_DOC_ID, "verified");
    expect(result.success).toBe(true);
    expect(computeAndSaveProfileStats).toHaveBeenCalledWith("worker-1");
  });

  it("rechazo con motivo: éxito y recálculo de badges/trust score", async () => {
    const result = await reviewVerificationDocument(PENDING_DOC_ID, "rejected", {
      rejectionReason: "expired",
      rejectionNote: "Vencido hace 2 meses",
    });
    expect(result.success).toBe(true);
    expect(computeAndSaveProfileStats).toHaveBeenCalledWith("worker-1");
  });

  it("documento ya revisado (0 filas afectadas por el guard atómico status='pending'): error sin recalcular", async () => {
    state.updateResult = { data: null, error: null };
    const result = await reviewVerificationDocument(PENDING_DOC_ID, "verified");
    expect(result.error).toBe("Este documento ya fue revisado o no existe.");
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });

  it("error de Supabase en el UPDATE: se propaga como error sin recalcular", async () => {
    state.updateResult = { data: null, error: { message: "db down" } };
    const result = await reviewVerificationDocument(PENDING_DOC_ID, "verified");
    expect(result.error).toBeTruthy();
    expect(computeAndSaveProfileStats).not.toHaveBeenCalled();
  });
});

const TARGET_USER_ID = "user-42";

describe("changeUserRole — corrige el bug 'no puedo volver a Administrador'", () => {
  beforeEach(() => {
    state.user = { id: "admin-1" };
    state.profileRole = "admin";
    state.profileUpdates = [];
    state.targetUserRoles = [];
    state.adminUserRolesWrites = [];
  });

  it("6. un no-admin no puede llamar changeUserRole (assertAdmin lo rechaza, sin ningún UPDATE)", async () => {
    state.profileRole = "worker";
    await expect(changeUserRole(TARGET_USER_ID, "admin")).rejects.toThrow("No autorizado");
    expect(state.profileUpdates).toEqual([]);
    expect(state.adminUserRolesWrites).toEqual([]);
  });

  it("promueve a admin: crea la fila user_roles(role='admin', active=true) sin tocar profiles.role de otra forma que el UPDATE pedido", async () => {
    const result = await changeUserRole(TARGET_USER_ID, "admin");
    expect(result.error).toBeUndefined();
    expect(state.profileUpdates).toEqual([{ userId: TARGET_USER_ID, role: "admin" }]);
    expect(state.adminUserRolesWrites).toEqual([
      { op: "insert", payload: { user_id: TARGET_USER_ID, role: "admin" } },
    ]);
    expect(state.targetUserRoles).toEqual([{ id: "admin-row", role: "admin", active: true }]);
  });

  it("promover a admin es idempotente: si ya existe una fila admin activa, no vuelve a escribir user_roles", async () => {
    state.targetUserRoles = [{ id: "admin-row", role: "admin", active: true }];
    const result = await changeUserRole(TARGET_USER_ID, "admin");
    expect(result.error).toBeUndefined();
    expect(state.adminUserRolesWrites).toEqual([]);
  });

  it("promover a admin reactiva una fila admin previamente desactivada (re-promoción tras una degradación)", async () => {
    state.targetUserRoles = [{ id: "admin-row", role: "admin", active: false }];
    const result = await changeUserRole(TARGET_USER_ID, "admin");
    expect(result.error).toBeUndefined();
    expect(state.adminUserRolesWrites).toEqual([
      { op: "update", payload: { active: true }, match: { id: "admin-row" } },
    ]);
    expect(state.targetUserRoles[0].active).toBe(true);
  });

  it("degrada de admin a worker: desactiva la fila user_roles(role='admin') para que switchRoleAction('admin') deje de encontrarla", async () => {
    state.targetUserRoles = [{ id: "admin-row", role: "admin", active: true }];
    const result = await changeUserRole(TARGET_USER_ID, "worker");
    expect(result.error).toBeUndefined();
    expect(state.profileUpdates).toEqual([{ userId: TARGET_USER_ID, role: "worker" }]);
    expect(state.adminUserRolesWrites).toEqual([
      { op: "update", payload: { active: false }, match: { user_id: TARGET_USER_ID, role: "admin" } },
    ]);
    expect(state.targetUserRoles[0].active).toBe(false);
  });

  it("degradar a un usuario que nunca fue admin no falla aunque no exista ninguna fila admin que desactivar", async () => {
    const result = await changeUserRole(TARGET_USER_ID, "employer");
    expect(result.error).toBeUndefined();
    expect(state.profileUpdates).toEqual([{ userId: TARGET_USER_ID, role: "employer" }]);
  });
});
