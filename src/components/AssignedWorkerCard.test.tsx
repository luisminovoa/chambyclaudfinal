import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssignedWorkerCard } from "./AssignedWorkerCard";
import type { PublicWorkerSummary } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const worker: PublicWorkerSummary = {
  id: "worker-1",
  full_name: "Ana Trabajadora",
  avatar_url: null,
  category: "Electricista",
  city: "Chiclayo",
};

describe("AssignedWorkerCard — Ver perfil + Abrir chat (Fase C4-G6)", () => {
  it("'Ver perfil' siempre enlaza a /workers/[id]", () => {
    const html = renderToStaticMarkup(<AssignedWorkerCard worker={worker} rating={null} />);
    expect(html).toMatch(/<a href="\/workers\/worker-1"/);
    expect(html).toContain("Ver perfil");
  });

  it("sin conversationId, NO muestra 'Abrir chat'", () => {
    const html = renderToStaticMarkup(
      <AssignedWorkerCard worker={worker} rating={null} conversationId={null} />
    );
    expect(html).not.toContain("Abrir chat");
  });

  it("con conversationId, muestra '💬 Abrir chat' hacia /messages/[conversationId]", () => {
    const html = renderToStaticMarkup(
      <AssignedWorkerCard worker={worker} rating={null} conversationId="conv-1" />
    );
    expect(html).toContain("💬 Abrir chat");
    expect(html).toMatch(/<a href="\/messages\/conv-1"/);
  });

  it("es puramente presentacional: ningún botón dispara una acción de creación (solo <a href>, sin onClick/form)", () => {
    const html = renderToStaticMarkup(
      <AssignedWorkerCard worker={worker} rating={null} conversationId="conv-1" />
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});
