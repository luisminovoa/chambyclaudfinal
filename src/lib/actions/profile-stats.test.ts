import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeAndSaveProfileStats } from "./profile";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

interface ProfileRow {
  role: string;
  bio: string | null;
  category: string | null;
  skills: string[];
  city: string | null;
  district: string | null;
  employer_type: string | null;
  business_name: string | null;
  business_sector: string | null;
  business_description: string | null;
}

interface State {
  userId: string;
  profile: ProfileRow;
  photos: { is_primary: boolean }[];
  documents: { document_type: string; status: string }[];
  workerDetails: {
    professional_title: string | null;
    years_experience: number | null;
    hourly_rate: number | null;
    daily_rate: number | null;
  } | null;
  experienceCount: number;
  upsertedPayload: Record<string, unknown> | null;
}

const state: State = {
  userId: "user-1",
  profile: {
    role: "worker",
    bio: null,
    category: null,
    skills: [],
    city: null,
    district: null,
    employer_type: null,
    business_name: null,
    business_sector: null,
    business_description: null,
  },
  photos: [],
  documents: [],
  workerDetails: null,
  experienceCount: 0,
  upsertedPayload: null,
};

function reset() {
  state.userId = "user-1";
  state.profile = {
    role: "worker",
    bio: null,
    category: null,
    skills: [],
    city: null,
    district: null,
    employer_type: null,
    business_name: null,
    business_sector: null,
    business_description: null,
  };
  state.photos = [];
  state.documents = [];
  state.workerDetails = null;
  state.experienceCount = 0;
  state.upsertedPayload = null;
  revalidatePath.mockClear();
}

function readClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: state.userId } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: state.profile }) }),
          }),
        };
      }
      if (table === "profile_photos") {
        return { select: () => ({ eq: async () => ({ data: state.photos }) }) };
      }
      if (table === "verification_documents") {
        return { select: () => ({ eq: async () => ({ data: state.documents }) }) };
      }
      if (table === "worker_profile_details") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.workerDetails }) }),
          }),
        };
      }
      if (table === "worker_experience") {
        return { select: () => ({ eq: async () => ({ count: state.experienceCount }) }) };
      }
      throw new Error(`Tabla no mockeada (createClient): ${table}`);
    },
  };
}

function adminClient() {
  return {
    from: (table: string) => {
      if (table === "profile_stats") {
        return {
          upsert: (payload: Record<string, unknown>) => {
            state.upsertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({ data: payload, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`Tabla no mockeada (createAdminClient): ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => readClient(),
  createAdminClient: () => adminClient(),
}));

describe("computeAndSaveProfileStats() — ramas worker/employer y revalidatePath dinámico", () => {
  beforeEach(reset);

  it("worker: el cálculo existente no cambia (regresión) — foto+bio+categoría+3 skills+DNI verificado", async () => {
    state.profile = { ...state.profile, role: "worker", bio: "hola", category: "Electricista", skills: ["a", "b", "c"] };
    state.photos = [{ is_primary: true }];
    state.documents = [{ document_type: "dni", status: "verified" }];

    const res = await computeAndSaveProfileStats();

    expect("stats" in res).toBe(true);
    // 10 (foto) + 10 (bio) + 10 (categoría) + 10 (skills) + 10 (DNI) = 50
    expect(state.upsertedPayload?.completion_percentage).toBe(50);
    expect(state.upsertedPayload?.badges).toEqual(["identity_verified"]);
  });

  it("employer: usa los pesos de employer, no los de worker (categoría/skills no aplican)", async () => {
    state.profile = {
      ...state.profile,
      role: "employer",
      bio: null,
      category: "esto no debería contar para employer",
      skills: ["irrelevante", "para", "employer"],
      city: "Lima",
      district: "Los Olivos",
      employer_type: "company",
      business_name: "Ferretería Don Jose",
      business_sector: "Ferretería",
      business_description: "Vendemos herramientas",
    };
    state.photos = [{ is_primary: true }];

    const res = await computeAndSaveProfileStats();

    expect("stats" in res).toBe(true);
    // 15 (foto) + 15 (nombre) + 15 (descripción) + 10 (rubro) + 10 (tipo) + 5 (ciudad) + 5 (distrito) = 75
    expect(state.upsertedPayload?.completion_percentage).toBe(75);
  });

  it("employer: business_ruc NUNCA otorga ruc_active — solo un documento RUC verificado lo hace", async () => {
    state.profile = { ...state.profile, role: "employer" };
    // Sin verification_documents en absoluto — business_ruc vive en `profiles`,
    // fuera de este cálculo (que solo lee verification_documents).
    state.documents = [];

    const res = await computeAndSaveProfileStats();

    expect("stats" in res).toBe(true);
    expect(state.upsertedPayload?.badges).not.toContain("ruc_active");
  });

  it("employer: un documento RUC verificado sí otorga ruc_active", async () => {
    state.profile = { ...state.profile, role: "employer" };
    state.documents = [{ document_type: "ruc", status: "verified" }];

    await computeAndSaveProfileStats();

    expect(state.upsertedPayload?.badges).toContain("ruc_active");
  });

  it("employer: un RUC pendiente (status='pending') NO otorga ruc_active", async () => {
    state.profile = { ...state.profile, role: "employer" };
    state.documents = [{ document_type: "ruc", status: "pending" }];

    await computeAndSaveProfileStats();

    expect(state.upsertedPayload?.badges).not.toContain("ruc_active");
  });

  it("revalida el layout completo, no una ruta fija de worker (bug corregido)", async () => {
    state.profile = { ...state.profile, role: "employer" };

    await computeAndSaveProfileStats();

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard/worker/profile");
  });
});
