import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  documentStatusLabel,
  documentStatusTone,
  REJECTION_REASONS,
  rejectionReasonLabel,
} from "@/lib/document-verification";

describe("document-verification labels", () => {
  it("reutiliza los 3 estados existentes del enum document_status, no inventa nuevos", () => {
    expect(documentStatusLabel("pending")).toBe("En revisión");
    expect(documentStatusLabel("verified")).toBe("Verificado");
    expect(documentStatusLabel("rejected")).toBe("Rechazado");
  });

  it("mapea tono por estado para los badges", () => {
    expect(documentStatusTone("verified")).toBe("success");
    expect(documentStatusTone("rejected")).toBe("danger");
    expect(documentStatusTone("pending")).toBe("warning");
  });

  it("expone las 5 opciones de motivo de rechazo del ticket", () => {
    expect(REJECTION_REASONS.map((r) => r.value)).toEqual([
      "illegible",
      "expired",
      "data_mismatch",
      "wrong_document",
      "other",
    ]);
  });

  it("rejectionReasonLabel devuelve null cuando no hay motivo (documento no rechazado)", () => {
    expect(rejectionReasonLabel(null)).toBeNull();
  });

  it("rejectionReasonLabel resuelve un motivo válido a su texto en español", () => {
    expect(rejectionReasonLabel("expired")).toBe("Documento vencido");
  });

  it("documentTypeLabel cubre todos los DOCUMENT_TYPES declarados", () => {
    for (const dt of DOCUMENT_TYPES) {
      expect(documentTypeLabel(dt.value)).toBe(dt.label);
    }
  });
});
