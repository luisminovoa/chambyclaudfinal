import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PushNotificationsToggle, handleActivateClick } from "./PushNotificationsToggle";
import { usePushSubscription } from "@/lib/push/usePushSubscription";
import type { UsePushSubscriptionResult } from "@/lib/push/usePushSubscription";

/**
 * FASE P1-B2.16 — igual que push.test.ts/BottomNavClient.test.tsx: este
 * proyecto no usa jsdom/testing-library (vitest.config.ts corre con
 * `environment: "node"`), así que no hay forma de simular un evento de
 * click real en un `<button>`. Por eso:
 * - los estados de render (inicial, loading, éxito, error, no soportado,
 *   "checking") se prueban con `renderToStaticMarkup` sobre el hook
 *   mockeado, igual que BottomNavClient.test.tsx;
 * - que "el click invoca subscribe()" se prueba llamando directamente a
 *   `handleActivateClick` (la función nombrada a la que el botón delega
 *   su `onClick`, exportada exactamente para esto) en vez de disparar un
 *   evento de DOM inexistente.
 */

vi.mock("@/lib/push/usePushSubscription", () => ({
  usePushSubscription: vi.fn(),
}));

const mockedHook = vi.mocked(usePushSubscription);

function baseState(overrides: Partial<UsePushSubscriptionResult> = {}): UsePushSubscriptionResult {
  return {
    supported: "supported",
    permission: "default",
    subscribed: false,
    isPending: false,
    error: null,
    subscribe: vi.fn().mockResolvedValue(true),
    unsubscribe: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("PushNotificationsToggle (P1-B2.16)", () => {
  beforeEach(() => {
    mockedHook.mockReset();
  });

  it("estado inicial (soportado, no suscrito) — muestra el botón 'Activar notificaciones'", () => {
    mockedHook.mockReturnValue(baseState());
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toContain("Activar notificaciones");
    expect(html).toContain("Activa las notificaciones");
  });

  it("al hacer click en 'Activar notificaciones' invoca el flujo subscribe() del hook", async () => {
    const subscribe = vi.fn().mockResolvedValue(true);
    await handleActivateClick(subscribe);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("estado loading (isPending) — muestra 'Activando…', no el texto de acción", () => {
    mockedHook.mockReturnValue(baseState({ isPending: true }));
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toContain("Activando");
    expect(html).not.toContain(">Activar notificaciones<");
  });

  it("estado suscrito — muestra 'Notificaciones activadas', no el botón de activar", () => {
    mockedHook.mockReturnValue(baseState({ subscribed: true }));
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toContain("Notificaciones activadas");
    expect(html).not.toContain("Activar notificaciones");
  });

  it("estado error — muestra el mensaje de error ya provisto por el hook", () => {
    mockedHook.mockReturnValue(
      baseState({ error: "Debes conceder el permiso de notificaciones para activarlas." })
    );
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toContain("Debes conceder el permiso de notificaciones para activarlas.");
  });

  it("navegador sin soporte — muestra un mensaje apropiado, sin botón", () => {
    mockedHook.mockReturnValue(baseState({ supported: "unsupported" }));
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toContain("no disponibles en este dispositivo");
    expect(html).not.toContain("Activar notificaciones");
  });

  it("estado 'checking' (previo a saber si hay soporte) — no renderiza nada todavía", () => {
    mockedHook.mockReturnValue(baseState({ supported: "checking" }));
    const html = renderToStaticMarkup(<PushNotificationsToggle />);
    expect(html).toBe("");
  });

  it("montar/renderizar el componente NUNCA solicita permiso automáticamente: subscribe() no se llama solo por renderizar", () => {
    const subscribe = vi.fn().mockResolvedValue(true);
    mockedHook.mockReturnValue(baseState({ subscribe }));
    renderToStaticMarkup(<PushNotificationsToggle />);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
