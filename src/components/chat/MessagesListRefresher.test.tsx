import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessagesListRefresher } from "./MessagesListRefresher";
import { NotificationsProvider } from "@/lib/realtime/NotificationsProvider";

// useEffect no corre en renderToStaticMarkup (SSR) — este mock solo evita
// que useRouter() lance por falta de AppRouterContext, mismo patrón que
// src/app/page.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("MessagesListRefresher — sin salida visual, no rompe el render (Fase C4-G8.5)", () => {
  it("4. no renderiza nada (componente puramente de efecto)", () => {
    const html = renderToStaticMarkup(
      <NotificationsProvider userId={null} initialUnreadCount={0}>
        <MessagesListRefresher />
      </NotificationsProvider>
    );
    expect(html).toBe("");
  });

  it("5. montarlo junto a otro contenido no rompe el render de la lista", () => {
    const html = renderToStaticMarkup(
      <NotificationsProvider userId="user-1" initialUnreadCount={2}>
        <MessagesListRefresher />
        <p>Mensajes</p>
      </NotificationsProvider>
    );
    expect(html).toContain("Mensajes");
  });
});
