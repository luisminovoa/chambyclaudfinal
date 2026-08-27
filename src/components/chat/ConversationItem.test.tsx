import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationItem } from "./ConversationItem";
import type { ConversationWithDetails } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeConversation(
  overrides: Partial<ConversationWithDetails> = {}
): ConversationWithDetails {
  return {
    id: "conv-1",
    job_id: "job-1",
    employer_id: "employer-1",
    worker_id: "worker-1",
    created_at: "2026-01-01T00:00:00Z",
    job: { id: "job-1", title: "Electricista para local", status: "en_progreso" },
    employer: { id: "employer-1", full_name: "Empleador Uno", avatar_url: null },
    worker: { id: "worker-1", full_name: "Trabajador Uno", avatar_url: null },
    last_message: null,
    unread_count: 0,
    settings: null,
    ...overrides,
  };
}

describe("ConversationItem — estado de la chamba visible (Fase C4-G7B)", () => {
  it("F/G. muestra un Badge con el estado real del job de ESTA conversación (en_progreso)", () => {
    const html = renderToStaticMarkup(
      <ConversationItem conversation={makeConversation()} currentUserId="employer-1" />
    );
    expect(html).toContain("En progreso");
  });

  it("muestra 'Completado' cuando jobs.status = completado, sin ocultar ni bloquear la fila", () => {
    const html = renderToStaticMarkup(
      <ConversationItem
        conversation={makeConversation({ job: { id: "job-1", title: "Chamba", status: "completado" } })}
        currentUserId="employer-1"
      />
    );
    expect(html).toContain("Completado");
  });

  it("muestra 'Cancelado' cuando jobs.status = cancelado", () => {
    const html = renderToStaticMarkup(
      <ConversationItem
        conversation={makeConversation({ job: { id: "job-1", title: "Chamba", status: "cancelado" } })}
        currentUserId="employer-1"
      />
    );
    expect(html).toContain("Cancelado");
  });

  it("sin job asociado, no renderiza ningún badge de estado", () => {
    const html = renderToStaticMarkup(
      <ConversationItem conversation={makeConversation({ job: null })} currentUserId="employer-1" />
    );
    expect(html).not.toContain("En progreso");
    expect(html).not.toContain("Completado");
    expect(html).not.toContain("Cancelado");
    expect(html).not.toContain("Abierto");
  });

  it("cada conversación refleja el estado de SU PROPIO job (dos conversaciones distintas no se mezclan)", () => {
    const htmlA = renderToStaticMarkup(
      <ConversationItem
        conversation={makeConversation({
          id: "conv-a",
          job: { id: "job-a", title: "Chamba A", status: "abierto" },
        })}
        currentUserId="employer-1"
      />
    );
    const htmlB = renderToStaticMarkup(
      <ConversationItem
        conversation={makeConversation({
          id: "conv-b",
          job: { id: "job-b", title: "Chamba B", status: "completado" },
        })}
        currentUserId="employer-1"
      />
    );
    expect(htmlA).toContain("Abierto");
    expect(htmlA).not.toContain("Completado");
    expect(htmlB).toContain("Completado");
    expect(htmlB).not.toContain("Abierto");
  });
});
