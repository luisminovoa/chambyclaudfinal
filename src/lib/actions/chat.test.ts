import { describe, expect, it, vi, beforeEach } from "vitest";
import { getHiringConversations, getConversationIdForJob, getConversationForChat } from "./chat";

interface ConvRow {
  id: string;
  job_id: string;
  employer_id: string;
  worker_id: string;
}
interface JobRow {
  id: string;
  title: string;
  status?: string;
}

let authenticated = true;
let userId = "employer-1";
let viewerRole: string | null = "employer";
let conversationRows: ConvRow[] = [];
let jobRows: JobRow[] = [];
let messageRows: Record<string, unknown>[] = [];
let otherProfileRows: Record<string, unknown>[] = [];

function reset() {
  authenticated = true;
  userId = "employer-1";
  viewerRole = "employer";
  conversationRows = [];
  jobRows = [];
  messageRows = [];
  otherProfileRows = [];
}

/**
 * Builder genérico que aplica cada .eq()/.in() encadenado como un
 * predicado real sobre las filas mockeadas — mismo objetivo que el patrón
 * de workers.test.ts: verificar QUÉ filtra el resolver, no reimplementar
 * Postgres/RLS. `conversationRows` representa la tabla SIN el recorte de
 * RLS: los propios .eq(employer_id/worker_id, ...) del resolver son los
 * que deben excluir filas de terceros — si no lo hicieran, los tests 10/11
 * lo detectarían.
 */
function makeFilterBuilder(rows: Record<string, unknown>[]) {
  const predicates: ((r: Record<string, unknown>) => boolean)[] = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      predicates.push((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      predicates.push((r) => vals.includes(r[col]));
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: unknown }) => void) => {
      resolve({ data: rows.filter((r) => predicates.every((p) => p(r))) });
    },
    maybeSingle: async () => {
      const filtered = rows.filter((r) => predicates.every((p) => p(r)));
      return { data: filtered[0] ?? null };
    },
    single: async () => {
      const filtered = rows.filter((r) => predicates.every((p) => p(r)));
      return { data: filtered[0] ?? null };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: userId } : null } }),
    },
    from: (table: string) => {
      if (table === "profiles") return makeFilterBuilder([{ id: userId, role: viewerRole }]);
      if (table === "conversations") return makeFilterBuilder(conversationRows as unknown as Record<string, unknown>[]);
      if (table === "jobs") return makeFilterBuilder(jobRows as unknown as Record<string, unknown>[]);
      if (table === "messages") return makeFilterBuilder(messageRows);
      throw new Error(`tabla inesperada en el mock: ${table}`);
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "profiles") return makeFilterBuilder(otherProfileRows);
      throw new Error(`tabla inesperada en el mock admin: ${table}`);
    },
  }),
}));

describe("getHiringConversations — resolver de conversaciones existentes (Fase C4-G6)", () => {
  beforeEach(reset);

  it("1. usuario no autenticado → []", async () => {
    authenticated = false;
    const result = await getHiringConversations("worker-1");
    expect(result).toEqual([]);
  });

  it("2. sin relación (ninguna fila en conversations) → []", async () => {
    conversationRows = [];
    const result = await getHiringConversations("worker-1");
    expect(result).toEqual([]);
  });

  it("3/4. postulación pendiente o rechazada nunca crea una fila en conversations, así que tampoco hay chat — mismo caso que 'sin relación'", async () => {
    // conversations solo se inserta desde handle_application_accepted()
    // (0002_hiring_tracking.sql) — una postulación pendiente/rechazada
    // nunca produce una fila aquí, así que el resolver no necesita filtrar
    // por status de la postulación: si no hay fila, no hay chat.
    conversationRows = [];
    const result = await getHiringConversations("worker-1");
    expect(result).toEqual([]);
  });

  it("5/6. empleador con trabajador contratado (postulación aceptada) → chat disponible", async () => {
    userId = "employer-1";
    viewerRole = "employer";
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    jobRows = [{ id: "job-1", title: "Electricista para local" }];

    const result = await getHiringConversations("worker-1");

    expect(result).toEqual([
      { conversationId: "conv-1", jobId: "job-1", jobTitle: "Electricista para local" },
    ]);
  });

  it("7. trabajador → empleador que lo contrató → chat correcto (simétrico al caso 6)", async () => {
    userId = "worker-1";
    viewerRole = "worker";
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    jobRows = [{ id: "job-1", title: "Electricista para local" }];

    const result = await getHiringConversations("employer-1");

    expect(result).toEqual([
      { conversationId: "conv-1", jobId: "job-1", jobTitle: "Electricista para local" },
    ]);
  });

  it("8/9. dos usuarios con varias chambas → se resuelven TODAS, nunca se elige una arbitrariamente", async () => {
    userId = "employer-1";
    viewerRole = "employer";
    conversationRows = [
      { id: "conv-a", job_id: "job-a", employer_id: "employer-1", worker_id: "worker-1" },
      { id: "conv-b", job_id: "job-b", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    jobRows = [
      { id: "job-a", title: "Chamba A" },
      { id: "job-b", title: "Chamba B" },
    ];

    const result = await getHiringConversations("worker-1");

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.conversationId).sort()).toEqual(["conv-a", "conv-b"]);
  });

  it("10. usuario no participante de la conversación → no la obtiene (aunque exista entre otros dos)", async () => {
    userId = "employer-2"; // no es parte de la conversación de abajo
    viewerRole = "employer";
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];

    const result = await getHiringConversations("worker-1");

    expect(result).toEqual([]);
  });

  it("no ofrece chat consigo mismo (viewer === target)", async () => {
    userId = "employer-1";
    const result = await getHiringConversations("employer-1");
    expect(result).toEqual([]);
  });

  it("un viewer en modo admin (no employer/worker) no obtiene conversaciones vía este resolver", async () => {
    viewerRole = "admin";
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    const result = await getHiringConversations("worker-1");
    expect(result).toEqual([]);
  });

  it("11. nunca crea una conversación: el mock de 'conversations' no expone insert() y la llamada igual resuelve sin error", async () => {
    conversationRows = [];
    await expect(getHiringConversations("worker-1")).resolves.toEqual([]);
  });
});

describe("getConversationIdForJob — un job puntual (Fase C4-G6, AssignedWorkerCard)", () => {
  beforeEach(reset);

  it("usuario no autenticado → null", async () => {
    authenticated = false;
    const result = await getConversationIdForJob("job-1");
    expect(result).toBeNull();
  });

  it("sin conversación para ese job → null", async () => {
    conversationRows = [];
    const result = await getConversationIdForJob("job-1");
    expect(result).toBeNull();
  });

  it("con conversación existente para ese job (participante) → devuelve su id", async () => {
    userId = "employer-1";
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    const result = await getConversationIdForJob("job-1");
    expect(result).toBe("conv-1");
  });

  it("11. nunca crea una conversación: solo lee, resuelve null sin insertar nada", async () => {
    conversationRows = [];
    await expect(getConversationIdForJob("job-1")).resolves.toBeNull();
  });
});

describe("getConversationForChat — jobId/jobStatus expuestos al chat (Fase C4-G7B)", () => {
  beforeEach(() => {
    reset();
    conversationRows = [
      { id: "conv-1", job_id: "job-1", employer_id: "employer-1", worker_id: "worker-1" },
    ];
    otherProfileRows = [{ id: "worker-1", full_name: "Worker Uno", avatar_url: null, role: "worker" }];
  });

  it("A. devuelve jobId y jobStatus reales de jobs.status, nunca un valor inventado", async () => {
    jobRows = [{ id: "job-1", title: "Electricista para local", status: "en_progreso" }];

    const result = await getConversationForChat("conv-1");

    expect(result?.jobId).toBe("job-1");
    expect(result?.jobStatus).toBe("en_progreso");
    expect(result?.jobTitle).toBe("Electricista para local");
  });

  it("B. refleja completado sin alterar el flujo de mensajes (initialMessages sigue resolviendo)", async () => {
    jobRows = [{ id: "job-1", title: "Electricista para local", status: "completado" }];
    messageRows = [
      {
        id: "m1",
        conversation_id: "conv-1",
        sender_id: "worker-1",
        type: "text",
        body: "hola",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const result = await getConversationForChat("conv-1");

    expect(result?.jobStatus).toBe("completado");
    expect(result?.initialMessages).toHaveLength(1);
  });

  it("C. refleja cancelado", async () => {
    jobRows = [{ id: "job-1", title: "Electricista para local", status: "cancelado" }];

    const result = await getConversationForChat("conv-1");

    expect(result?.jobStatus).toBe("cancelado");
  });

  it("D. usuario no autenticado → null (sin exponer jobId/jobStatus)", async () => {
    authenticated = false;
    jobRows = [{ id: "job-1", title: "Electricista para local", status: "abierto" }];

    const result = await getConversationForChat("conv-1");

    expect(result).toBeNull();
  });

  it("E. usuario no participante de la conversación → null", async () => {
    userId = "employer-2";
    jobRows = [{ id: "job-1", title: "Electricista para local", status: "abierto" }];

    const result = await getConversationForChat("conv-1");

    expect(result).toBeNull();
  });
});
