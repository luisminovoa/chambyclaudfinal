import { describe, expect, it, vi, beforeEach } from "vitest";
import { getEmployerPublicProfile } from "./employers";

const EMPLOYER_ID = "11111111-1111-4111-8111-111111111111";
const WORKER_ONLY_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

interface ProfileRow {
  id: string;
  role: string;
  full_name: string;
}

interface RoleRow {
  user_id: string;
  role: string;
  active: boolean;
}

interface State {
  profiles: Record<string, ProfileRow>;
  userRoles: RoleRow[];
  jobs: { id: string; employer_id: string; status: string }[];
}

const state: State = {
  profiles: {},
  userRoles: [],
  jobs: [],
};

function reset() {
  state.profiles = {
    [EMPLOYER_ID]: { id: EMPLOYER_ID, role: "employer", full_name: "Ferretería Don Jose" },
    [WORKER_ONLY_ID]: { id: WORKER_ONLY_ID, role: "worker", full_name: "Juan Trabajador" },
  };
  state.userRoles = [
    { user_id: EMPLOYER_ID, role: "worker", active: true },
    { user_id: EMPLOYER_ID, role: "employer", active: true },
    { user_id: WORKER_ONLY_ID, role: "worker", active: true },
  ];
  state.jobs = [{ id: "job-1", employer_id: EMPLOYER_ID, status: "abierto" }];
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({ data: state.profiles[val] ?? null }),
            }),
          }),
        };
      }
      if (table === "rating_summary") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      }
      if (table === "jobs") {
        return {
          select: (cols: string) => ({
            eq: (col: string, val: string) => {
              const filtered = () => state.jobs.filter((j) => (j as unknown as Record<string, unknown>)[col] === val);
              const chain = {
                eq: (col2: string, val2: string) => ({
                  order: () => ({
                    limit: async () => ({
                      data: filtered().filter((j) => (j as unknown as Record<string, unknown>)[col2] === val2),
                    }),
                    then: (resolve: (v: { count: number }) => void) =>
                      resolve({ count: filtered().filter((j) => (j as unknown as Record<string, unknown>)[col2] === val2).length }),
                  }),
                }),
                order: () => ({ limit: async () => ({ data: filtered() }) }),
                then: (resolve: (v: { count: number }) => void) => resolve({ count: filtered().length }),
              };
              return chain;
            },
          }),
        };
      }
      if (table === "job_applications") {
        return { select: () => ({ eq: () => ({ eq: async () => ({ count: 0 }) }) }) };
      }
      throw new Error(`Tabla no mockeada (createClient): ${table}`);
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: (_c1: string, userId: string) => ({
              eq: (_c2: string, role: string) => ({
                eq: (_c3: string, active: boolean) => ({
                  maybeSingle: async () => ({
                    data:
                      state.userRoles.find(
                        (r) => r.user_id === userId && r.role === role && r.active === active
                      ) ?? null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "profile_stats") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      }
      throw new Error(`Tabla no mockeada (createAdminClient): ${table}`);
    },
  }),
}));

describe("getEmployerPublicProfile — no debe depender de profiles.role (modo activo mutable)", () => {
  beforeEach(reset);

  it("reproduce el bug: empleador con profiles.role='worker' (cambió de modo activo) sigue siendo visible como empleador", async () => {
    state.profiles[EMPLOYER_ID].role = "worker";

    const result = await getEmployerPublicProfile(EMPLOYER_ID);

    expect(result).not.toBeNull();
    expect(result?.profile.id).toBe(EMPLOYER_ID);
  });

  it("caso simple: profiles.role='employer' sigue funcionando", async () => {
    const result = await getEmployerPublicProfile(EMPLOYER_ID);
    expect(result).not.toBeNull();
    expect(result?.profile.id).toBe(EMPLOYER_ID);
  });

  it("un worker que nunca poseyó el rol employer sigue sin poder resolverse como perfil de empleador", async () => {
    const result = await getEmployerPublicProfile(WORKER_ONLY_ID);
    expect(result).toBeNull();
  });

  it("un id inexistente devuelve null", async () => {
    const result = await getEmployerPublicProfile(MISSING_ID);
    expect(result).toBeNull();
  });

  it("un empleador con el rol employer desactivado (active=false) ya no se muestra como empleador público", async () => {
    state.userRoles = state.userRoles.map((r) =>
      r.user_id === EMPLOYER_ID && r.role === "employer" ? { ...r, active: false } : r
    );
    const result = await getEmployerPublicProfile(EMPLOYER_ID);
    expect(result).toBeNull();
  });
});
