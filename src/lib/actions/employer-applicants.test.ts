import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  listEmployerApplicants,
  getEmployerApplicantCounts,
  listEmployerJobOptions,
} from "./employer-applicants";

interface JobRow {
  id: string;
  title: string;
  status: string;
  employer_id: string;
}

interface ApplicationRow {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
  worker_id: string;
}

interface State {
  user: { id: string } | null;
  userRoles: string[];
  jobs: JobRow[];
  applications: ApplicationRow[];
  profiles: { id: string; full_name: string; avatar_url: string | null; city: string | null; category: string | null }[];
  /** Tablas leídas con el cliente admin (service role), para auditar su uso. */
  adminTablesRead: string[];
  /** true en cuanto se instancia createAdminClient(). */
  adminClientCreated: boolean;
}

const state: State = {
  user: null,
  userRoles: [],
  jobs: [],
  applications: [],
  profiles: [],
  adminTablesRead: [],
  adminClientCreated: false,
};

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: async () => ({
    user: state.user,
    profile: state.user ? { id: state.user.id, role: "employer" } : null,
    userRoles: state.userRoles,
  }),
}));

function selectChain(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const chain = {
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    in(col: string, vals: unknown[]) {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: filtered, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "jobs") {
        return { select: () => selectChain(state.jobs as unknown as Record<string, unknown>[]) };
      }
      if (table === "job_applications") {
        // Emula el embed `worker:profiles!...(*)` de PostgREST.
        const withWorker = state.applications.map((a) => ({
          ...a,
          worker: state.profiles.find((p) => p.id === a.worker_id) ?? null,
        }));
        return { select: () => selectChain(withWorker as unknown as Record<string, unknown>[]) };
      }
      if (table === "rating_summary") {
        return { select: () => selectChain([]) };
      }
      throw new Error(`Tabla no mockeada (cliente de sesión): ${table}`);
    },
  }),
  createAdminClient: () => {
    state.adminClientCreated = true;
    return {
      from: (table: string) => {
        state.adminTablesRead.push(table);
        return { select: () => selectChain([]) };
      },
    };
  },
}));

const EMPLOYER_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYER_B = "22222222-2222-4222-8222-222222222222";
const WORKER_1 = "33333333-3333-4333-8333-333333333333";
const WORKER_2 = "44444444-4444-4444-8444-444444444444";
const JOB_A1 = "aaaaaaaa-1111-4111-8111-111111111111";
const JOB_A2 = "aaaaaaaa-2222-4222-8222-222222222222";
const JOB_B1 = "bbbbbbbb-1111-4111-8111-111111111111";

beforeEach(() => {
  state.user = { id: EMPLOYER_A };
  state.userRoles = ["employer"];
  state.jobs = [
    { id: JOB_A1, title: "Electricista para local", status: "abierto", employer_id: EMPLOYER_A },
    { id: JOB_A2, title: "Pintor fin de semana", status: "completado", employer_id: EMPLOYER_A },
    { id: JOB_B1, title: "Chamba de otro empleador", status: "abierto", employer_id: EMPLOYER_B },
  ];
  state.applications = [
    { id: "app-a1-1", job_id: JOB_A1, status: "pendiente", created_at: "2026-08-01T00:00:00Z", worker_id: WORKER_1 },
    { id: "app-a1-2", job_id: JOB_A1, status: "aceptado", created_at: "2026-08-02T00:00:00Z", worker_id: WORKER_2 },
    { id: "app-a2-1", job_id: JOB_A2, status: "rechazado", created_at: "2026-08-03T00:00:00Z", worker_id: WORKER_1 },
    { id: "app-b1-1", job_id: JOB_B1, status: "pendiente", created_at: "2026-08-04T00:00:00Z", worker_id: WORKER_1 },
  ];
  state.profiles = [
    { id: WORKER_1, full_name: "Ana Trabajadora", avatar_url: null, city: "Lima", category: "Electricista" },
    { id: WORKER_2, full_name: "Beto Trabajador", avatar_url: null, city: "Lima", category: "Pintor" },
  ];
  state.adminTablesRead = [];
  state.adminClientCreated = false;
});

describe("A/B. aislamiento entre empleadores", () => {
  it("A. el empleador obtiene los postulantes de todas SUS publicaciones", async () => {
    const items = await listEmployerApplicants();
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id).sort()).toEqual(["app-a1-1", "app-a1-2", "app-a2-1"]);
  });

  it("B. NUNCA aparece un postulante de la publicación de otro empleador", async () => {
    const items = await listEmployerApplicants();
    expect(items.some((i) => i.jobId === JOB_B1)).toBe(false);
    expect(items.some((i) => i.id === "app-b1-1")).toBe(false);
  });

  it("B2. filtrar por un jobId ajeno no filtra 'hacia' ese empleador: devuelve vacío", async () => {
    const items = await listEmployerApplicants({ jobId: JOB_B1 });
    expect(items).toEqual([]);
  });

  it("B3. los contadores tampoco incluyen postulaciones ajenas", async () => {
    const counts = await getEmployerApplicantCounts();
    expect(counts.all).toBe(3);
    expect(counts.pendiente).toBe(1);
    expect(counts.aceptado).toBe(1);
    expect(counts.rechazado).toBe(1);
  });

  it("un empleador sin publicaciones obtiene una lista vacía, no la de otro", async () => {
    state.jobs = state.jobs.filter((j) => j.employer_id !== EMPLOYER_A);
    expect(await listEmployerApplicants()).toEqual([]);
    expect((await getEmployerApplicantCounts()).all).toBe(0);
  });
});

describe("C/M. autorización por rol poseído", () => {
  it("C. un worker sin rol employer no puede obtener el listado", async () => {
    state.userRoles = ["worker"];
    await expect(listEmployerApplicants()).rejects.toThrow("No autorizado");
    await expect(getEmployerApplicantCounts()).rejects.toThrow("No autorizado");
    await expect(listEmployerJobOptions()).rejects.toThrow("No autorizado");
  });

  it("C2. sin sesión no se puede obtener el listado", async () => {
    state.user = null;
    await expect(listEmployerApplicants()).rejects.toThrow("No autenticado");
  });

  it("M. worker+employer sí puede usar la vista: se autoriza por rol POSEÍDO, no por modo activo", async () => {
    state.userRoles = ["worker", "employer"];
    const items = await listEmployerApplicants();
    expect(items).toHaveLength(3);
  });
});

describe("F/G. filtros", () => {
  it("F. filtro por publicación propia devuelve solo esa publicación", async () => {
    const items = await listEmployerApplicants({ jobId: JOB_A1 });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.jobId === JOB_A1)).toBe(true);
  });

  it("G. filtro por estado usa los valores reales del enum", async () => {
    const pendientes = await listEmployerApplicants({ status: "pendiente" });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].status).toBe("pendiente");

    const aceptados = await listEmployerApplicants({ status: "aceptado" });
    expect(aceptados).toHaveLength(1);
  });

  it("G2. un estado inventado se ignora en vez de romper la consulta", async () => {
    const items = await listEmployerApplicants({ status: "contratado" });
    expect(items).toHaveLength(3);
  });

  it("F+G. los dos filtros se combinan", async () => {
    const items = await listEmployerApplicants({ jobId: JOB_A1, status: "pendiente" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("app-a1-1");
  });
});

describe("datos que necesita la fila de postulante", () => {
  it("cada item trae la publicación a la que postuló y su fecha", async () => {
    const items = await listEmployerApplicants({ jobId: JOB_A1 });
    expect(items[0].jobTitle).toBe("Electricista para local");
    expect(items[0].createdAt).toBe("2026-08-01T00:00:00Z");
  });

  it("N. cada item trae el perfil del trabajador para poder abrirlo", async () => {
    const items = await listEmployerApplicants({ jobId: JOB_A1 });
    expect(items[0].worker.id).toBe(WORKER_1);
    expect(items[0].worker.full_name).toBe("Ana Trabajadora");
  });

  it("expone el estado de la PUBLICACIÓN, para no ofrecer aceptar en una ya cerrada", async () => {
    const abierta = await listEmployerApplicants({ jobId: JOB_A1 });
    const cerrada = await listEmployerApplicants({ jobId: JOB_A2 });
    expect(abierta[0].jobStatus).toBe("abierto");
    expect(cerrada[0].jobStatus).toBe("completado");
  });

  it("el cliente admin solo se usa para worker_profile_details, y nunca antes de autorizar", async () => {
    state.userRoles = ["worker"];
    await expect(listEmployerApplicants()).rejects.toThrow("No autorizado");
    expect(state.adminClientCreated).toBe(false);

    state.userRoles = ["employer"];
    await listEmployerApplicants();
    expect(state.adminTablesRead).toEqual(["worker_profile_details"]);
  });
});

describe("D/E. integración con el dashboard y protección de la ruta", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

  it("D. el KPI 'Postulantes' del dashboard enlaza a /dashboard/employer/applicants", () => {
    const dashboard = read("app/dashboard/employer/page.tsx");
    expect(dashboard).toContain('href="/dashboard/employer/applicants"');
    expect(dashboard).toContain('label="Postulantes"');
  });

  it("E. la ruta existe y exige sesión + rol employer poseído", () => {
    const page = read("app/dashboard/employer/applicants/page.tsx");
    expect(page).toContain('redirect("/login?next=/dashboard/employer/applicants")');
    expect(page).toContain('userRoles.includes("employer")');
    expect(page).toContain('redirect("/dashboard")');
  });

  it("E2. aceptar/rechazar reutiliza la Server Action existente, sin lógica nueva", () => {
    const page = read("app/dashboard/employer/applicants/page.tsx");
    const row = read("components/ApplicantRow.tsx");
    // La página no llama directamente a ninguna mutación: delega en ApplicantRow.
    expect(page).toContain("ApplicantRow");
    expect(page).not.toContain("updateApplicationStatus");
    expect(row).toContain('updateApplicationStatus');
    expect(row).toContain('from "@/lib/actions/jobs"');
  });
});
