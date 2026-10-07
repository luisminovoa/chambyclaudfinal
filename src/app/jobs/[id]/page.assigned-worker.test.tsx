import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobDetailPage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

/**
 * 0061 — public_profiles pasa a contener SOLO empleadores, así que el
 * trabajador asignado ya no puede leerse de esa vista. /jobs/[id] lo lee
 * con createAdminClient() + lista blanca de 5 columnas, y SOLO cuando el
 * viewer es el dueño del trabajo o el trabajador asignado (con sesión).
 *
 * Estos tests fijan quién ejecuta esa consulta y quién ve la tarjeta. No
 * usan public_workers a propósito: filtra por profiles.role='worker' (modo
 * activo) y existen trabajadores asignados que no lo cumplen.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/chat", () => ({
  getConversationIdForJob: vi.fn(async () => null),
}));

const EMPLOYER_ID = "employer-1";
const WORKER_ID = "worker-1";
const STRANGER_ID = "stranger-1";

const BASE_JOB = {
  id: "job-1",
  employer_id: EMPLOYER_ID,
  title: "Electricista para instalación",
  description: "Se busca electricista con experiencia.",
  category: "Electricista",
  city: "Chiclayo",
  department: null as string | null,
  province: null as string | null,
  district: null as string | null,
  address: null,
  pay_amount: 100,
  pay_type: "por_dia",
  status: "en_progreso",
  positions_needed: 1,
  assigned_worker_id: WORKER_ID as string | null,
  starts_at: null,
  hired_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// Fila "real" de profiles del trabajador asignado. `role` NO es 'worker'
// a propósito (multi-rol en modo employer): public_workers no la devolvería.
const WORKER_PROFILE_ROW: Record<string, unknown> = {
  id: WORKER_ID,
  full_name: "Ana Pérez",
  avatar_url: null,
  category: "Electricista",
  city: "Chiclayo",
  role: "employer",
  phone: "999999999",
};

interface AdminCall {
  table: string;
  columns: string;
  id: unknown;
}

interface State {
  job: typeof BASE_JOB;
  adminCalls: AdminCall[];
  clientTables: string[];
}

const state: State = { job: BASE_JOB, adminCalls: [], clientTables: [] };

/** Builder encadenable: select/eq/order/in, y se puede await-ear o cerrar con single/maybeSingle. */
function makeBuilder(getRow: (filters: Record<string, unknown>) => unknown, onSelect?: (cols: string) => void) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: (cols?: string) => {
      onSelect?.(cols ?? "*");
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    in: () => builder,
    order: () => builder,
    single: async () => ({ data: getRow(filters) }),
    maybeSingle: async () => ({ data: getRow(filters) }),
    then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      state.clientTables.push(table);
      if (table === "jobs") return makeBuilder(() => state.job);
      if (table === "public_profiles") {
        // Simula la vista POST-0061: solo empleadores. Un trabajador no está.
        return makeBuilder((f) =>
          f.id === EMPLOYER_ID
            ? { id: EMPLOYER_ID, full_name: "Jose Ramirez", avatar_url: null, city: "Chiclayo" }
            : null
        );
      }
      if (table === "rating_summary") return makeBuilder(() => null);
      if (table === "job_state_history") return makeBuilder(() => null);
      if (table === "job_applications") return makeBuilder(() => null);
      throw new Error(`tabla inesperada en el mock de /jobs/[id]: ${table}`);
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      const call: AdminCall = { table, columns: "", id: undefined };
      state.adminCalls.push(call);
      return makeBuilder(
        (f) => {
          call.id = f.id;
          if (table !== "profiles" || f.id !== WORKER_ID) return null;
          // Proyecta SOLO las columnas pedidas — como haría PostgREST.
          const wanted = call.columns.split(",").map((c) => c.trim());
          return Object.fromEntries(wanted.map((c) => [c, WORKER_PROFILE_ROW[c]]));
        },
        (cols) => {
          call.columns = cols;
        }
      );
    },
  }),
}));

function asViewer(userId: string | null, role: "worker" | "employer" | null) {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
    user: userId ? { id: userId } : null,
    profile: userId && role ? ({ id: userId, role } as never) : null,
    userRoles: role ? [role] : [],
  });
}

async function render() {
  return renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
}

function workerAdminCalls() {
  return state.adminCalls.filter((c) => c.table === "profiles" && c.id === WORKER_ID);
}

describe("/jobs/[id] — trabajador asignado (0061, opción B)", () => {
  beforeEach(() => {
    state.job = { ...BASE_JOB };
    state.adminCalls = [];
    state.clientTables = [];
  });

  it("1. visitante con trabajador asignado: NO consulta datos del trabajador y no ve la tarjeta", async () => {
    asViewer(null, null);
    const html = await render();

    expect(state.adminCalls).toEqual([]);
    expect(state.clientTables).not.toContain("public_workers");
    expect(html).not.toContain("Trabajador asignado");
    expect(html).not.toContain("Ana Pérez");
    // El empleador sigue resolviéndose desde public_profiles para el público.
    expect(html).toContain("Jose Ramirez");
  });

  it("2. propietario: consulta con admin (5 columnas, solo ese id) y muestra la tarjeta", async () => {
    asViewer(EMPLOYER_ID, "employer");
    const html = await render();

    const calls = workerAdminCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].columns).toBe("id, full_name, avatar_url, category, city");
    expect(html).toContain("Trabajador asignado");
    expect(html).toContain("Ana Pérez");
    expect(html).not.toContain("999999999");
  });

  it("3. trabajador asignado: consulta y muestra la tarjeta", async () => {
    asViewer(WORKER_ID, "worker");
    const html = await render();

    expect(workerAdminCalls()).toHaveLength(1);
    expect(html).toContain("Trabajador asignado");
    expect(html).toContain("Ana Pérez");
  });

  it("4. usuario autenticado sin relación: NO consulta datos del trabajador ni ve la tarjeta", async () => {
    asViewer(STRANGER_ID, "worker");
    const html = await render();

    expect(workerAdminCalls()).toEqual([]);
    expect(state.adminCalls).toEqual([]);
    expect(html).not.toContain("Trabajador asignado");
    expect(html).not.toContain("Ana Pérez");
  });

  it("5. trabajador asignado con profiles.role != 'worker': el propietario sigue viendo la tarjeta", async () => {
    // WORKER_PROFILE_ROW.role === 'employer' (modo activo employer): public_workers
    // no lo devolvería; la lectura por admin sí.
    expect(WORKER_PROFILE_ROW.role).not.toBe("worker");
    asViewer(EMPLOYER_ID, "employer");
    const html = await render();

    expect(state.clientTables).not.toContain("public_workers");
    expect(html).toContain("Trabajador asignado");
    expect(html).toContain("Ana Pérez");
  });

  it("6. sin trabajador asignado: ni el propietario dispara la consulta", async () => {
    state.job = { ...BASE_JOB, assigned_worker_id: null, status: "abierto" };
    asViewer(EMPLOYER_ID, "employer");
    const html = await render();

    expect(workerAdminCalls()).toEqual([]);
    expect(html).not.toContain("Trabajador asignado");
  });
});
