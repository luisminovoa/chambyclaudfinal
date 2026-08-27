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

/**
 * Cuenta las etiquetas <path> del SVG renderizado — Check (lucide-react)
 * tiene exactamente 1 <path>, CheckCheck exactamente 2 (verificado contra
 * node_modules/lucide-react/dist/esm/icons/{check,check-check}.mjs). Para
 * un mensaje de texto plano, ReadStatus es el único ícono dentro de la
 * burbuja (MapPin/ExternalLink/ImageIcon solo aparecen para type
 * "image"/"location"), así que contar <path> en todo el HTML es
 * inequívoco aquí — más robusto que un snapshot y no depende de props
 * internas de lucide-react que puedan cambiar de versión.
 */
function countPaths(html: string): number {
  return (html.match(/<path\b/g) ?? []).length;
}

describe("MessageBubble / ReadStatus — íconos y color correctos por estado (Fase C4-G8.4)", () => {
  it("Enviando → Clock (ícono lucide-clock), nunca un check", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ id: "optimistic-123" })}
        isMine
        isOptimistic
        otherParticipantLastReadAt={null}
      />
    );
    expect(html).toContain('aria-label="Enviando"');
    expect(html).toContain("lucide-clock");
    expect(html).not.toContain("lucide-check");
  });

  it("Enviado → UN solo check (Check, 1 <path>), no CheckCheck", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt={null}
      />
    );
    expect(html).toContain('aria-label="Enviado"');
    expect(countPaths(html)).toBe(1);
    // La clase de lucide para CheckCheck es "lucide-check-check" — su
    // ausencia confirma que no es el ícono de doble check.
    expect(html).not.toContain("lucide-check-check");
  });

  it("Leído → DOS checks (CheckCheck, 2 <path>)", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt="2024-01-01T13:00:00Z"
      />
    );
    expect(html).toContain('aria-label="Leído"');
    expect(countPaths(html)).toBe(2);
    expect(html).toContain("lucide-check-check");
  });

  it("Leído usa un color con contraste real contra bg-primary-600 (sky-300), nunca el primary-400 anterior de bajo contraste", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt="2024-01-01T13:00:00Z"
      />
    );
    expect(html).toContain("text-sky-300");
    expect(html).not.toContain("text-primary-400");
  });

  it("Enviado mantiene el gris claro original (text-slate-300)", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ created_at: "2024-01-01T12:00:00Z" })}
        isMine
        otherParticipantLastReadAt={null}
      />
    );
    expect(html).toContain("text-slate-300");
  });
});
