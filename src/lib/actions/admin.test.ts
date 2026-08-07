import { describe, expect, it, vi, beforeEach } from "vitest";
import { reviewVerificationDocument } from "./admin";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const computeAndSaveProfileStats = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/profile", () => ({
  computeAndSaveProfileStats: (...args: unknown[]) => computeAndSaveProfileStats(...args),
}));

interface State {
  user: { id: string } | null;
  profileRole: string | null;
  updateResult: { data: unknown; error: { message: string } | null };
}

const state: State = {
  user: null,
  profileRole: null,
  updateResult: { data: null, error: null },
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
        };
      }
      if (table === "verification_documents") {
        return makeUpdateChain();
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
  createAdminClient: () => ({}),
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
