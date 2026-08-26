import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ConversationPage from "./page";
import { getConversationForChat } from "@/lib/actions/chat";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

vi.mock("@/components/chat/ChatWindow", () => ({
  ChatWindow: () => <div data-testid="chat-window" />,
}));

vi.mock("@/lib/actions/chat", () => ({
  getConversationForChat: vi.fn(),
}));

const mockGetConversationForChat = vi.mocked(getConversationForChat);

const baseData = {
  otherUser: { id: "worker-1", full_name: "Trabajador Uno", avatar_url: null, role: "worker" as const },
  currentUserId: "employer-1",
  initialMessages: [],
  initialHasMore: false,
  jobId: "job-1",
  jobTitle: "Electricista para local",
  jobStatus: "en_progreso" as const,
};

describe("/messages/[conversationId] — estado de la chamba en el header (Fase C4-G7B)", () => {
  beforeEach(() => {
    mockGetConversationForChat.mockReset();
  });

  it("H. muestra el Badge con la etiqueta real del estado (en_progreso → 'En progreso')", async () => {
    mockGetConversationForChat.mockResolvedValue({ ...baseData });
    const html = renderToStaticMarkup(await ConversationPage({ params: { conversationId: "conv-1" } }));
    expect(html).toContain("En progreso");
  });

  it("I. muestra 'Ver chamba' enlazando a /jobs/[jobId] cuando hay job", async () => {
    mockGetConversationForChat.mockResolvedValue({ ...baseData });
    const html = renderToStaticMarkup(await ConversationPage({ params: { conversationId: "conv-1" } }));
    expect(html).toContain("Ver chamba");
    expect(html).toMatch(/<a href="\/jobs\/job-1"/);
  });

  it("J. chat completado sigue mostrando el chat completo (sin banners/interstitials)", async () => {
    mockGetConversationForChat.mockResolvedValue({ ...baseData, jobStatus: "completado" });
    const html = renderToStaticMarkup(await ConversationPage({ params: { conversationId: "conv-1" } }));
    expect(html).toContain("Completado");
    expect(html).toContain('data-testid="chat-window"');
  });

  it("K. chat cancelado sigue mostrando el chat completo", async () => {
    mockGetConversationForChat.mockResolvedValue({ ...baseData, jobStatus: "cancelado" });
    const html = renderToStaticMarkup(await ConversationPage({ params: { conversationId: "conv-1" } }));
    expect(html).toContain("Cancelado");
    expect(html).toContain('data-testid="chat-window"');
  });

  it("L. sin jobTitle (no debería ocurrir en la práctica, pero es defensivo), no renderiza Badge ni 'Ver chamba'", async () => {
    mockGetConversationForChat.mockResolvedValue({
      ...baseData,
      jobTitle: null,
      jobId: null,
      jobStatus: null,
    });
    const html = renderToStaticMarkup(await ConversationPage({ params: { conversationId: "conv-1" } }));
    expect(html).not.toContain("Ver chamba");
    expect(html).not.toContain("En progreso");
  });
});
