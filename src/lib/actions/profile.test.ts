import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateProfile } from "./profile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

interface State {
  user: { id: string } | null;
  updateCalls: { payload: Record<string, unknown>; eqId: string }[];
}

const state: State = { user: null, updateCalls: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, val: string) => {
              state.updateCalls.push({ payload, eqId: val });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
  createAdminClient: () => {
    throw new Error("updateProfile() no debería usar el cliente admin");
  },
}));

function reset() {
  state.user = { id: "employer-1" };
  state.updateCalls = [];
}

describe("updateProfile() — reutilizada por EmployerInfoTab (worker e employer comparten la misma Server Action)", () => {
  beforeEach(reset);

  it("un employer puede actualizar su propio perfil (bio/phone/city)", async () => {
    const fd = new FormData();
    fd.set("bio", "Somos una ferretería familiar en Los Olivos.");
    fd.set("phone", "+51999999999");
    fd.set("city", "Lima");

    const result = await updateProfile(fd);

    expect(result).toEqual({ success: true });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe("employer-1");
    expect(state.updateCalls[0].payload).toMatchObject({
      bio: "Somos una ferretería familiar en Los Olivos.",
      phone: "+51999999999",
      city: "Lima",
    });
  });

  it("full_name se actualiza cuando se envía explícitamente (flujo de EmployerInfoTab)", async () => {
    const fd = new FormData();
    fd.set("full_name", "Ferretería Don Jose");
    fd.set("bio", "");
    fd.set("phone", "");
    fd.set("city", "");

    const result = await updateProfile(fd);

    expect(result).toEqual({ success: true });
    expect(state.updateCalls[0].payload.full_name).toBe("Ferretería Don Jose");
  });

  it("full_name NO se toca si el FormData no lo incluye (flujo de InfoTab de worker — sin regresión)", async () => {
    const fd = new FormData();
    fd.set("bio", "hola");
    fd.set("phone", "");
    fd.set("city", "");
    fd.set("category", "");
    fd.set("skills", "");

    await updateProfile(fd);

    expect(state.updateCalls[0].payload).not.toHaveProperty("full_name");
  });

  it("rechaza full_name vacío/solo espacios y no escribe nada en la base", async () => {
    const fd = new FormData();
    fd.set("full_name", "   ");

    const result = await updateProfile(fd);

    expect(result).toEqual({ error: "El nombre no puede estar vacío." });
    expect(state.updateCalls).toHaveLength(0);
  });

  it("rechaza full_name demasiado largo y no escribe nada en la base", async () => {
    const fd = new FormData();
    fd.set("full_name", "a".repeat(121));

    const result = await updateProfile(fd);

    expect(result).toEqual({ error: "El nombre es demasiado largo." });
    expect(state.updateCalls).toHaveLength(0);
  });

  it("un usuario NO puede modificar el perfil de otro: el UPDATE siempre apunta a auth.uid(), aunque el FormData incluya un id ajeno", async () => {
    state.user = { id: "employer-1" };
    const fd = new FormData();
    fd.set("bio", "intento de modificar a otro usuario");
    fd.set("id", "victim-2");
    fd.set("profileId", "victim-2");
    fd.set("userId", "victim-2");

    await updateProfile(fd);

    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe("employer-1");
    expect(state.updateCalls[0].eqId).not.toBe("victim-2");
  });

  it("sin sesión, rechaza sin llamar a Supabase", async () => {
    state.user = null;
    const fd = new FormData();
    fd.set("bio", "x");

    const result = await updateProfile(fd);

    expect(result).toEqual({ error: "No autenticado." });
    expect(state.updateCalls).toHaveLength(0);
  });
});
