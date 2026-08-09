import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createReportEvidenceUploadUrl,
  saveReportEvidence,
  deleteReportEvidence,
  getReportEvidenceSignedUrl,
  getReportEvidence,
} from "./report-evidence";

/**
 * Tests unitarios (mock de Supabase) — no ejecutan contra un Postgres
 * ni un Storage real. La garantía real de que "el usuario reportado no
 * puede leer evidencia" es la policy RLS report_evidence_select_own_or_admin
 * (0019) + esta capa de aplicación como defensa adicional; aquí solo se
 * prueba el código TypeScript.
 */

/** El tipo de retorno real es `{success:true} & T` o `{error:string}` — sin campo `success` en la rama de error, así que TS exige angostar con `"error" in r` antes de leer cualquier otro campo. Estos helpers hacen eso una sola vez por assertion. */
function expectOk<T extends object>(r: { error: string } | ({ success: true } & T)): T {
  if ("error" in r) throw new Error(`se esperaba éxito pero devolvió error: ${r.error}`);
  const { success: _success, ...rest } = r;
  return rest as T;
}
function expectErr(r: { error: string } | { success: true }): string {
  if (!("error" in r)) throw new Error("se esperaba un error pero la operación tuvo éxito");
  return r.error;
}

function selectChain(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const chain = {
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    order() {
      return chain;
    },
    single: async () => ({ data: filtered[0] ?? null, error: filtered[0] ? null : { message: "not found" } }),
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    then(resolve: (v: { data: unknown[]; error: null; count: number }) => void) {
      resolve({ data: filtered, error: null, count: filtered.length });
    },
  };
  return chain;
}

interface ReportRow {
  id: string;
  reporter_id: string;
  status: string;
}

interface EvidenceRow {
  id: string;
  report_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

interface State {
  user: { id: string } | null;
  reports: ReportRow[];
  evidence: EvidenceRow[];
  profiles: { id: string; role: string }[];
  forceInsertError: boolean;
  removedPaths: string[];
  signedUploadUrls: string[];
  signedUrlCalls: { path: string; ttl: number }[];
}

const state: State = {
  user: null,
  reports: [],
  evidence: [],
  profiles: [],
  forceInsertError: false,
  removedPaths: [],
  signedUploadUrls: [],
  signedUrlCalls: [],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "reports") {
        return { select: () => selectChain(state.reports as unknown as Record<string, unknown>[]) };
      }
      if (table === "profiles") {
        return { select: () => selectChain(state.profiles as unknown as Record<string, unknown>[]) };
      }
      if (table === "report_evidence") {
        return {
          select: () => selectChain(state.evidence as unknown as Record<string, unknown>[]),
          insert: (payload: Omit<EvidenceRow, "id" | "created_at">) => ({
            select: () => ({
              single: async () => {
                if (state.forceInsertError) return { data: null, error: { message: "insert failed" } };
                const row: EvidenceRow = {
                  id: `ev-${state.evidence.length + 1}`,
                  created_at: new Date().toISOString(),
                  ...payload,
                };
                state.evidence.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          delete: () => ({
            eq: (col: string, val: unknown) => {
              const idx = state.evidence.findIndex((e) => (e as unknown as Record<string, unknown>)[col] === val);
              if (idx >= 0) state.evidence.splice(idx, 1);
              return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
            },
          }),
        };
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    },
  }),
  createAdminClient: () => ({
    storage: {
      from: (_bucket: string) => ({
        createSignedUploadUrl: async (path: string) => {
          state.signedUploadUrls.push(path);
          return { data: { signedUrl: `https://signed-upload/${path}` }, error: null };
        },
        createSignedUrl: async (path: string, ttl: number) => {
          state.signedUrlCalls.push({ path, ttl });
          return { data: { signedUrl: `https://signed/${path}` }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removedPaths.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

const REPORTER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const REPORTED_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const REPORT_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  state.user = { id: REPORTER_ID };
  state.reports = [{ id: REPORT_ID, reporter_id: REPORTER_ID, status: "pending" }];
  state.evidence = [];
  state.profiles = [
    { id: REPORTER_ID, role: "worker" },
    { id: OTHER_USER_ID, role: "worker" },
    { id: REPORTED_ID, role: "employer" },
    { id: ADMIN_ID, role: "admin" },
  ];
  state.forceInsertError = false;
  state.removedPaths = [];
  state.signedUploadUrls = [];
  state.signedUrlCalls = [];
});

describe("createReportEvidenceUploadUrl / saveReportEvidence", () => {
  it("1. el reportante puede subir evidencia a su propio reporte pendiente", async () => {
    const urlRes = await createReportEvidenceUploadUrl(REPORT_ID, "foto.jpg", "image/jpeg", 1024);
    const { storagePath } = expectOk(urlRes);

    const saveRes = await saveReportEvidence({
      reportId: REPORT_ID,
      storagePath,
      fileName: "foto.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
    });
    expectOk(saveRes);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0].uploaded_by).toBe(REPORTER_ID);
  });

  it("2. un usuario no puede subir evidencia a un reporte ajeno", async () => {
    state.user = { id: OTHER_USER_ID };
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "foto.jpg", "image/jpeg", 1024);
    expect(expectErr(result)).toBe("Reporte no encontrado.");
    expect(state.signedUploadUrls).toHaveLength(0);
  });

  it("3. no se puede subir evidencia a un reporte que ya no está pending (under_review)", async () => {
    state.reports[0].status = "under_review";
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "foto.jpg", "image/jpeg", 1024);
    expect(expectErr(result)).toMatch(/pendiente/);
  });

  it("4a. tipo MIME no permitido es rechazado", async () => {
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "script.exe", "application/x-msdownload", 1024);
    expect(expectErr(result)).toBe("Solo se permiten imágenes (JPG, PNG, WebP) o PDF.");
  });

  it("4b. extensión inconsistente con el content-type declarado es rechazada (mismatch)", async () => {
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "evidencia.pdf", "image/png", 1024);
    expect(expectErr(result)).toBe("La extensión del archivo no coincide con su tipo.");
  });

  it("5. archivo demasiado grande (>10MB) es rechazado", async () => {
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "foto.jpg", "image/jpeg", 11 * 1024 * 1024);
    expect(expectErr(result)).toBe("El archivo no puede superar 10 MB.");
  });

  it("6. el sexto archivo es rechazado (máximo 5 por reporte)", async () => {
    state.evidence = Array.from({ length: 5 }, (_, i) => ({
      id: `ev-${i}`,
      report_id: REPORT_ID,
      storage_path: `${REPORTER_ID}/${REPORT_ID}/existing-${i}.jpg`,
      file_name: `existing-${i}.jpg`,
      content_type: "image/jpeg",
      file_size: 100,
      uploaded_by: REPORTER_ID,
      created_at: new Date().toISOString(),
    }));
    const result = await createReportEvidenceUploadUrl(REPORT_ID, "sexto.jpg", "image/jpeg", 1024);
    expect(expectErr(result)).toMatch(/máximo de 5/);
  });

  it("7. el storagePath se genera en el servidor con el prefijo reporterId/reportId/", async () => {
    const urlRes = await createReportEvidenceUploadUrl(REPORT_ID, "foto.png", "image/png", 2048);
    const { storagePath } = expectOk(urlRes);
    expect(storagePath.startsWith(`${REPORTER_ID}/${REPORT_ID}/`)).toBe(true);
    expect(storagePath.endsWith(".png")).toBe(true);
  });

  it("8. saveReportEvidence rechaza un storagePath arbitrario que no corresponde al usuario/reporte", async () => {
    const result = await saveReportEvidence({
      reportId: REPORT_ID,
      storagePath: `${OTHER_USER_ID}/${REPORT_ID}/archivo.jpg`,
      fileName: "archivo.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
    });
    expect(expectErr(result)).toBe("Ruta de archivo inválida.");
    expect(state.evidence).toHaveLength(0);
  });

  it("8b. saveReportEvidence rechaza un storagePath con traversal (..)", async () => {
    const result = await saveReportEvidence({
      reportId: REPORT_ID,
      storagePath: `${REPORTER_ID}/${REPORT_ID}/../../../etc/passwd`,
      fileName: "passwd",
      contentType: "image/jpeg",
      fileSize: 1024,
    });
    expect(expectErr(result)).toBe("Ruta de archivo inválida.");
  });

  it("si el INSERT falla después de subir, se limpia el objeto huérfano del bucket", async () => {
    state.forceInsertError = true;
    const storagePath = `${REPORTER_ID}/${REPORT_ID}/huerfano.jpg`;
    const result = await saveReportEvidence({
      reportId: REPORT_ID,
      storagePath,
      fileName: "huerfano.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
    });
    expect(expectErr(result)).toBeTruthy();
    expect(state.removedPaths).toContain(storagePath);
  });
});

describe("deleteReportEvidence", () => {
  beforeEach(() => {
    state.evidence = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        report_id: REPORT_ID,
        storage_path: `${REPORTER_ID}/${REPORT_ID}/foto.jpg`,
        file_name: "foto.jpg",
        content_type: "image/jpeg",
        file_size: 1024,
        uploaded_by: REPORTER_ID,
        created_at: new Date().toISOString(),
      },
    ];
  });

  it("9. el reportante puede eliminar su propia evidencia mientras el reporte sigue pending", async () => {
    const result = await deleteReportEvidence("66666666-6666-4666-8666-666666666666");
    expectOk(result);
    expect(state.evidence).toHaveLength(0);
    expect(state.removedPaths).toContain(`${REPORTER_ID}/${REPORT_ID}/foto.jpg`);
  });

  it("10. el reportante no puede eliminar evidencia una vez que el reporte pasó a under_review", async () => {
    state.reports[0].status = "under_review";
    const result = await deleteReportEvidence("66666666-6666-4666-8666-666666666666");
    expect(expectErr(result)).toMatch(/pendiente/);
    expect(state.evidence).toHaveLength(1);
  });

  it("un usuario no puede eliminar evidencia que no le pertenece", async () => {
    state.user = { id: OTHER_USER_ID };
    const result = await deleteReportEvidence("66666666-6666-4666-8666-666666666666");
    expect(expectErr(result)).toBe("Evidencia no encontrada.");
    expect(state.evidence).toHaveLength(1);
  });
});

describe("getReportEvidenceSignedUrl", () => {
  beforeEach(() => {
    state.evidence = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        report_id: REPORT_ID,
        storage_path: `${REPORTER_ID}/${REPORT_ID}/foto.jpg`,
        file_name: "foto.jpg",
        content_type: "image/jpeg",
        file_size: 1024,
        uploaded_by: REPORTER_ID,
        created_at: new Date().toISOString(),
      },
    ];
  });

  it("el propio reportante puede pedir la signed URL de su evidencia", async () => {
    const result = await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expectOk(result);
    expect(state.signedUrlCalls[0]).toMatchObject({ path: `${REPORTER_ID}/${REPORT_ID}/foto.jpg`, ttl: 300 });
  });

  it("11. un admin puede consultar (pedir signed URL de) evidencia de cualquier reporte", async () => {
    state.user = { id: ADMIN_ID };
    const result = await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expectOk(result);
  });

  it("12. un usuario no-admin y no dueño no puede consultar la evidencia", async () => {
    state.user = { id: OTHER_USER_ID };
    const result = await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expect(expectErr(result)).toBe("No autorizado.");
  });

  it("13. el usuario reportado no puede consultar la evidencia en su contra", async () => {
    state.user = { id: REPORTED_ID };
    const result = await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expect(expectErr(result)).toBe("No autorizado.");
  });

  it("usuario no autenticado no puede consultar evidencia", async () => {
    state.user = null;
    const result = await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expect(expectErr(result)).toBeTruthy();
  });

  it("nunca persiste la signed URL — cada llamado genera una nueva", async () => {
    await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    await getReportEvidenceSignedUrl("66666666-6666-4666-8666-666666666666");
    expect(state.signedUrlCalls).toHaveLength(2);
  });
});

describe("getReportEvidence (Fase 5 — cierre de cobertura IDOR)", () => {
  beforeEach(() => {
    state.evidence = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        report_id: REPORT_ID,
        storage_path: `${REPORTER_ID}/${REPORT_ID}/foto.jpg`,
        file_name: "foto.jpg",
        content_type: "image/jpeg",
        file_size: 1024,
        uploaded_by: REPORTER_ID,
        created_at: new Date().toISOString(),
      },
    ];
  });

  it("8/9. el dueño del reporte puede listar su propia evidencia", async () => {
    const result = await getReportEvidence(REPORT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].uploaded_by).toBe(REPORTER_ID);
  });

  it("8/9. otro usuario nunca ve evidencia ajena, aunque conozca el reportId (scoping por uploaded_by en la propia consulta)", async () => {
    state.user = { id: OTHER_USER_ID };
    const result = await getReportEvidence(REPORT_ID);
    expect(result).toEqual([]);
  });

  it("el usuario reportado tampoco puede ver la evidencia en su contra vía esta función", async () => {
    state.user = { id: REPORTED_ID };
    const result = await getReportEvidence(REPORT_ID);
    expect(result).toEqual([]);
  });

  it("usuario no autenticado obtiene lista vacía, no un error crudo", async () => {
    state.user = null;
    const result = await getReportEvidence(REPORT_ID);
    expect(result).toEqual([]);
  });
});
