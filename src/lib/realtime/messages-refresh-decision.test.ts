import { describe, expect, it } from "vitest";
import { shouldRefreshForNotification, MESSAGES_REFRESH_DEBOUNCE_MS } from "./messages-refresh-decision";

describe("shouldRefreshForNotification — dispara router.refresh() solo para new_message (Fase C4-G8.5)", () => {
  it("1. new_message → dispara refresh (sin refresh previo)", () => {
    const result = shouldRefreshForNotification({ type: "new_message" }, 0, 10_000);
    expect(result).toBe(true);
  });

  it("2. cualquier tipo distinto de new_message → nunca dispara refresh", () => {
    const types = [
      "new_application",
      "application_accepted",
      "application_rejected",
      "job_started",
      "job_completed",
      "new_rating",
      "reminder",
      "system",
      "admin_alert",
      "report_status_update",
      "moderation_action",
    ] as const;

    for (const type of types) {
      expect(shouldRefreshForNotification({ type }, 0, 10_000)).toBe(false);
    }
  });

  it("3. varios new_message consecutivos y muy seguidos → solo el primero dispara (debounce)", () => {
    let lastRefreshAt = 0;
    const now1 = 1_000;
    expect(shouldRefreshForNotification({ type: "new_message" }, lastRefreshAt, now1)).toBe(true);
    lastRefreshAt = now1;

    const now2 = now1 + 100; // muy seguido, dentro de la ventana de debounce
    expect(shouldRefreshForNotification({ type: "new_message" }, lastRefreshAt, now2)).toBe(false);
  });

  it("4. tras pasar la ventana de debounce, un new_message posterior vuelve a disparar", () => {
    const lastRefreshAt = 1_000;
    const now = lastRefreshAt + MESSAGES_REFRESH_DEBOUNCE_MS;
    expect(shouldRefreshForNotification({ type: "new_message" }, lastRefreshAt, now)).toBe(true);
  });

  it("5. no hay notificación previa (lastRefreshAt=0) muy al inicio del reloj → sigue disparando (no hay falso negativo por 'now' pequeño)", () => {
    expect(shouldRefreshForNotification({ type: "new_message" }, 0, MESSAGES_REFRESH_DEBOUNCE_MS)).toBe(
      true
    );
  });
});
