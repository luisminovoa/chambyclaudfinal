import { describe, expect, it } from "vitest";
import { isOwnMessage, shouldRefreshForNewMessage, MESSAGES_REFRESH_DEBOUNCE_MS } from "./messages-refresh-decision";

describe("isOwnMessage — nunca refrescar por mensajes propios (Fase C4-G8.5P)", () => {
  it("mensaje enviado por el propio usuario → true", () => {
    expect(isOwnMessage({ sender_id: "user-1" }, "user-1")).toBe(true);
  });

  it("mensaje enviado por otro participante → false", () => {
    expect(isOwnMessage({ sender_id: "worker-1" }, "employer-1")).toBe(false);
  });
});

describe("shouldRefreshForNewMessage — debounce de router.refresh() (Fase C4-G8.5P)", () => {
  it("1. sin refresh previo → dispara", () => {
    expect(shouldRefreshForNewMessage(0, 10_000)).toBe(true);
  });

  it("2. varios eventos consecutivos y muy seguidos → solo el primero dispara (debounce)", () => {
    let lastRefreshAt = 0;
    const now1 = 1_000;
    expect(shouldRefreshForNewMessage(lastRefreshAt, now1)).toBe(true);
    lastRefreshAt = now1;

    const now2 = now1 + 100; // muy seguido, dentro de la ventana de debounce
    expect(shouldRefreshForNewMessage(lastRefreshAt, now2)).toBe(false);
  });

  it("3. tras pasar la ventana de debounce, un evento posterior vuelve a disparar", () => {
    const lastRefreshAt = 1_000;
    const now = lastRefreshAt + MESSAGES_REFRESH_DEBOUNCE_MS;
    expect(shouldRefreshForNewMessage(lastRefreshAt, now)).toBe(true);
  });

  it("4. exactamente en el borde de la ventana → dispara (>=, no solo >)", () => {
    expect(shouldRefreshForNewMessage(0, MESSAGES_REFRESH_DEBOUNCE_MS)).toBe(true);
  });

  it("5. justo antes del borde de la ventana → no dispara", () => {
    expect(shouldRefreshForNewMessage(0, MESSAGES_REFRESH_DEBOUNCE_MS - 1)).toBe(false);
  });
});
