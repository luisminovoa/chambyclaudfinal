import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/lib/types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversation_id: "conv-1",
    sender_id: "employer-1",
    body: "Hola",
    type: "text",
    attachment_url: null,
    metadata: null,
    read_at: null,
    created_at: "2024-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("MessageBubble / ReadStatus — 'Leído' derivado del cursor del otro participante (Fase C4-G8.2)", () => {
  it("mensaje propio + cursor del otro POSTERIOR al mensaje → 'Leído'", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt="2024-01-01T13:00:00Z"
      />
    );
    expect(html).toContain('aria-label="Leído"');
  });

  it("mensaje propio + cursor del otro ANTERIOR al mensaje → 'Enviado'", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt="2024-01-01T11:00:00Z"
      />
    );
    expect(html).toContain('aria-label="Enviado"');
    expect(html).not.toContain('aria-label="Leído"');
  });

  it("mensaje propio + cursor null (el otro nunca leyó) → 'Enviado'", () => {
    const html = renderToStaticMarkup(
      <MessageBubble message={makeMessage()} isMine otherParticipantLastReadAt={null} />
    );
    expect(html).toContain('aria-label="Enviado"');
  });

  it("mensaje RECIBIDO nunca muestra el estado de lectura propio, aunque exista cursor", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ sender_id: "worker-1" })}
        isMine={false}
        otherParticipantLastReadAt="2099-01-01T00:00:00Z"
      />
    );
    expect(html).not.toContain('aria-label="Leído"');
    expect(html).not.toContain('aria-label="Enviado"');
    expect(html).not.toContain('aria-label="Enviando"');
  });

  it("mensaje optimista (aún no confirmado) → 'Enviando', sin importar el cursor", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ id: "optimistic-123" })}
        isMine
        isOptimistic
        otherParticipantLastReadAt="2099-01-01T00:00:00Z"
      />
    );
    expect(html).toContain('aria-label="Enviando"');
  });

  it("ya no depende de message.read_at: read_at=null con cursor posterior sigue mostrando 'Leído'", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z", read_at: null })}
        isMine
        otherParticipantLastReadAt="2024-01-01T13:00:00Z"
      />
    );
    expect(html).toContain('aria-label="Leído"');
  });
});
