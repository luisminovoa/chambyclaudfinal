import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAdminUserProfile } from "./admin";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";

interface ProfileRow {
  id: string;
  role: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  skills: string[];
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface JobRow {
  employer_id: string | null;
  assigned_worker_id: string | null;
  status: string;
}

interface State {
  caller: { id: string } | null;
  callerProfileRow: { role: string } | null;
  targetProfileRow: ProfileRow | null;
  userRoles: { role: string }[];
  workerDetails: unknown | null;
  experience: unknown[];
  photos: unknown[];
  stats: { trust_score: number; completion_percentage: number; badges: string[] } | null;
  ratingSummary: { average_score: number; total_ratings: number } | null;
  documents: { id: string; storage_path: string; file_name: string; document_type: string; status: string }[];
  documentReviews: unknown[];
  jobs: JobRow[];
  applicationsCount: number;
  authEmail: string | null;
  createAdminClientCalls: number;
  signedUrlCalls: { path: string; expiresIn: number }[];
}

const state: State = {
  caller: null,
  callerProfileRow: null,
  targetProfileRow: null,
  userRoles: [],
  workerDetails: null,
  experience: [],
  photos: [],
  stats: null,
  ratingSummary: null,
  documents: [],
  documentReviews: [],
  jobs: [],
  applicationsCount: 0,
  authEmail: null,
  createAdminClientCalls: 0,
  signedUrlCalls: [],
};

function genericChain(result: { data: unknown; error?: unknown }) {
  const chain = {
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    single: async () => ({ data: result.data, error: result.error ?? null }),
    maybeSingle: async () => ({ data: result.data, error: result.error ?? null }),
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: result.data, error: result.error ?? null }),
  };
  return chain;
}

function jobsChain(predicate: (r: JobRow) => boolean) {
  const chain = {
    eq(col: string, val: unknown) {
      const prev = predicate;
      const next = (r: JobRow) => prev(r) && (r as unknown as Record<string, unknown>)[col] === val;
      return jobsChain(next);
    },
    then(resolve: (v: { data: JobRow[]; count: number; error: null }) => void) {
      const rows = state.jobs.filter(predicate);
      resolve({ data: rows, count: rows.length, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.caller } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: state.callerProfileRow, error: null }),
              maybeSingle: async () => ({ data: state.targetProfileRow, error: null }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return { select: () => genericChain({ data: state.userRoles }) };
      }
      if (table === "worker_profile_details") {
        return { select: () => genericChain({ data: state.workerDetails }) };
      }
      if (table === "worker_experience") {
        return { select: () => genericChain({ data: state.experience }) };
      }
      if (table === "rating_summary") {
        return { select: () => genericChain({ data: state.ratingSummary }) };
      }
      if (table === "verification_documents") {
        return { select: () => genericChain({ data: state.documents }) };
      }
      if (table === "verification_document_reviews") {
        return { select: () => genericChain({ data: state.documentReviews }) };
      }
      if (table === "jobs") {
        return { select: () => jobsChain(() => true) };
      }
      if (table === "job_applications") {
        return {
          select: () => ({
            eq: async () => ({ data: [], count: state.applicationsCount, error: null }),
          }),
        };
      }
      throw new Error(`Tabla no mockeada (createClient): ${table}`);
    },
  }),
  createAdminClient: () => {
    state.createAdminClientCalls += 1;
    return {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: state.authEmail ? { email: state.authEmail } : null },
            error: null,
          }),
        },
      },
      from: (table: string) => {
        if (table === "profile_photos") return { select: () => genericChain({ data: state.photos }) };
        if (table === "profile_stats") return { select: () => genericChain({ data: state.stats }) };
        throw new Error(`Tabla no mockeada (createAdminClient): ${table}`);
      },
      storage: {
        from: () => ({
          createSignedUrl: async (path: string, expiresIn: number) => {
            state.signedUrlCalls.push({ path, expiresIn });
            return { data: { signedUrl: `https://signed.example/${path}?ttl=${expiresIn}` }, error: null };
          },
        }),
      },
    };
  },
}));

vi.mock("@/lib/actions/profile", () => ({
  computeAndSaveProfileStats: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function reset() {
  state.caller = { id: "admin-1" };
  state.callerProfileRow = { role: "admin" };
  state.targetProfileRow = {
    id: TARGET_ID,
    role: "worker",
    full_name: "Juan Pérez",
    phone: "999888777",
    city: "Lima",
    category: "Electricista",
    skills: ["electricidad", "instalaciones"],
    bio: "Electricista con 10 años de experiencia.",
    avatar_url: null,
    is_active: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
  state.userRoles = [{ role: "worker" }];
  state.workerDetails = null;
  state.experience = [];
  state.photos = [];
  state.stats = { trust_score: 42, completion_percentage: 60, badges: ["identity_verified"] };
  state.ratingSummary = { average_score: 4.8, total_ratings: 12 };
  state.documents = [];
  state.documentReviews = [];
  state.jobs = [];
  state.applicationsCount = 0;
  state.authEmail = "juan@example.com";
  state.createAdminClientCalls = 0;
  state.signedUrlCalls = [];
}

describe("getAdminUserProfile", () => {
  beforeEach(reset);

  it("1. admin puede obtener el perfil de un usuario", async () => {
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result).not.toBeNull();
    expect(result?.profile.full_name).toBe("Juan Pérez");
  });

  it("2. worker no puede obtener perfil administrativo — assertAdmin lanza antes de cualquier consulta", async () => {
    state.callerProfileRow = { role: "worker" };
    await expect(getAdminUserProfile(TARGET_ID)).rejects.toThrow("No autorizado");
    expect(state.createAdminClientCalls).toBe(0);
  });

  it("3. employer no puede obtener perfil administrativo — assertAdmin lanza antes de cualquier consulta", async () => {
    state.callerProfileRow = { role: "employer" };
    await expect(getAdminUserProfile(TARGET_ID)).rejects.toThrow("No autorizado");
    expect(state.createAdminClientCalls).toBe(0);
  });

  it("4. usuario no autenticado no puede obtenerlo", async () => {
    state.caller = null;
    await expect(getAdminUserProfile(TARGET_ID)).rejects.toThrow("No autenticado");
    expect(state.createAdminClientCalls).toBe(0);
  });

  it("5. perfil inexistente devuelve error controlado (null, no una excepción)", async () => {
    state.targetProfileRow = null;
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result).toBeNull();
  });

  it("id con formato inválido devuelve null sin llegar a consultar la base de datos", async () => {
    const result = await getAdminUserProfile("no-es-un-uuid");
    expect(result).toBeNull();
  });

  it("6. los documentos del usuario aparecen correctamente, con tipo/estado/nombre", async () => {
    state.documents = [
      {
        id: "doc-1",
        storage_path: `${TARGET_ID}/dni.jpg`,
        file_name: "dni.jpg",
        document_type: "dni",
        status: "verified",
      },
    ];
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.documents).toHaveLength(1);
    expect(result?.documents[0].document_type).toBe("dni");
    expect(result?.documents[0].status).toBe("verified");
    expect(result?.documents[0].file_name).toBe("dni.jpg");
  });

  it("7. los documentos usan URLs firmadas (signed URL de 5 minutos, nunca una URL pública)", async () => {
    state.documents = [
      {
        id: "doc-1",
        storage_path: `${TARGET_ID}/dni.jpg`,
        file_name: "dni.jpg",
        document_type: "dni",
        status: "pending",
      },
    ];
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.documents[0].documentUrl).toBe(`https://signed.example/${TARGET_ID}/dni.jpg?ttl=300`);
    expect(state.signedUrlCalls).toEqual([{ path: `${TARGET_ID}/dni.jpg`, expiresIn: 300 }]);
  });

  it("8. no se expone service_role al cliente: createAdminClient() nunca se invoca si assertAdmin() rechaza al llamante", async () => {
    state.callerProfileRow = { role: "worker" };
    await expect(getAdminUserProfile(TARGET_ID)).rejects.toThrow();
    expect(state.createAdminClientCalls).toBe(0);

    // Y para un admin autorizado, sí se usa (server-side, después de
    // assertAdmin) — pero solo lo que la función devuelve es el resultado
    // ya resuelto (URLs firmadas, email), nunca el cliente ni sus
    // credenciales.
    state.callerProfileRow = { role: "admin" };
    const result = await getAdminUserProfile(TARGET_ID);
    expect(state.createAdminClientCalls).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("serviceRoleKey");
    expect(JSON.stringify(result)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  });

  it("9. el email se obtiene desde Supabase Auth (admin.auth.admin.getUserById), no desde profiles", async () => {
    state.authEmail = "trabajador@correo.com";
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.email).toBe("trabajador@correo.com");
    // profiles (Profile) no tiene columna email — si algo la está leyendo
    // de ahí, targetProfileRow tendría que tener el campo, y no lo tiene.
    expect("email" in (state.targetProfileRow as object)).toBe(false);
  });

  it("email ausente en Auth no rompe la respuesta — queda null, no undefined ni excepción", async () => {
    state.authEmail = null;
    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.email).toBeNull();
  });

  it("11. un admin puede visualizar el perfil de un trabajador (incluye datos worker-only)", async () => {
    state.targetProfileRow = { ...(state.targetProfileRow as ProfileRow), role: "worker" };
    state.userRoles = [{ role: "worker" }];
    state.workerDetails = { profile_id: TARGET_ID, professional_title: "Electricista certificado" };
    state.jobs = [{ employer_id: null, assigned_worker_id: TARGET_ID, status: "completado" }];
    state.applicationsCount = 3;

    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.profile.role).toBe("worker");
    expect(result?.userRoles).toEqual(["worker"]);
    expect(result?.activity.applicationsSubmitted).toBe(3);
    expect(result?.activity.jobsCompletedAsWorker).toBe(1);
  });

  it("12. un admin puede visualizar el perfil de un empleador (cuenta la actividad de employer)", async () => {
    state.targetProfileRow = { ...(state.targetProfileRow as ProfileRow), role: "employer" };
    state.userRoles = [{ role: "employer" }];
    state.jobs = [
      { employer_id: TARGET_ID, assigned_worker_id: null, status: "abierto" },
      { employer_id: TARGET_ID, assigned_worker_id: null, status: "completado" },
      { employer_id: TARGET_ID, assigned_worker_id: null, status: "completado" },
    ];

    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.profile.role).toBe("employer");
    expect(result?.userRoles).toEqual(["employer"]);
    expect(result?.activity.jobsPublished).toBe(3);
    expect(result?.activity.jobsCompletedAsEmployer).toBe(2);
  });

  it("distingue correctamente actividad de worker y de employer para una cuenta con ambos roles", async () => {
    state.userRoles = [{ role: "worker" }, { role: "employer" }];
    state.jobs = [
      { employer_id: TARGET_ID, assigned_worker_id: null, status: "abierto" },
      { employer_id: TARGET_ID, assigned_worker_id: null, status: "completado" },
      { employer_id: null, assigned_worker_id: TARGET_ID, status: "en_progreso" },
      { employer_id: null, assigned_worker_id: TARGET_ID, status: "completado" },
    ];

    const result = await getAdminUserProfile(TARGET_ID);
    expect(result?.activity).toEqual({
      jobsPublished: 2,
      jobsCompletedAsEmployer: 1,
      jobsCompletedAsWorker: 1,
      jobsInProgressAsWorker: 1,
      applicationsSubmitted: 0,
      ratingsReceived: 12,
    });
  });
});
