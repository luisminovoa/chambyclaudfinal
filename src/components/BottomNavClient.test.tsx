import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNavClient } from "./BottomNavClient";
import { NotificationsProvider } from "@/lib/realtime/NotificationsProvider";

// Mismo patrón que src/app/page.test.tsx: sin AppRouterContext real,
// useRouter()/usePathname() necesitan un stub mínimo para renderizar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/messages",
}));

/**
 * Smoke test mínimo (Fase C4-G8.5) — no cubre el resto del comportamiento
 * preexistente de BottomNavClient (sin tests antes de esta fase); solo
 * verifica que agregar useMessagesRefreshOnNewMessage() no rompe el
 * render ni el badge de mensajes ya existente.
 */
describe("BottomNavClient — no se rompe al agregar useMessagesRefreshOnNewMessage (Fase C4-G8.5)", () => {
  it("renderiza sin lanzar, con el badge de mensajes visible", () => {
    const html = renderToStaticMarkup(
      <NotificationsProvider userId="user-1" initialUnreadCount={0}>
        <BottomNavClient isLoggedIn role="worker" messagesUnreadCount={3} />
      </NotificationsProvider>
    );
    expect(html).toContain("Mensajes");
    expect(html).toContain(">3<");
  });

  it("sin mensajes no leídos, no muestra el badge numérico", () => {
    const html = renderToStaticMarkup(
      <NotificationsProvider userId="user-1" initialUnreadCount={0}>
        <BottomNavClient isLoggedIn role="worker" messagesUnreadCount={0} />
      </NotificationsProvider>
    );
    expect(html).not.toContain(">3<");
  });
});
