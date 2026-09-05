import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EmployerAgendaPage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMyCalendar } from "@/lib/actions/calendar";

/** FASE 3G — Sección 3 + Sección 4 (multi-role, test §15 items 2 y 12). */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/calendar", () => ({
  getMyCalendar: vi.fn(),
}));

describe("2. EmployerAgendaPage — renderiza trabajos agendados", () => {
  it("muestra los trabajos de asEmployer devueltos por getMyCalendar(), con el trabajador asignado", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "employer-1" },
      profile: { id: "employer-1", role: "employer" } as never,
      userRoles: ["employer"],
    });
    vi.mocked(getMyCalendar).mockResolvedValue({
      asWorker: [],
      asEmployer: [
        {
          id: "job-1",
          title: "Carga y descarga",
          status: "en_progreso",
          scheduled_start_at: "2099-01-02T08:00:00.000Z",
          scheduled_end_at: "2099-01-02T12:00:00.000Z",
          city: "Lambayeque",
          district: "Lambayeque",
          counterpartName: "Juan Torres",
        },
      ],
    });

    const html = renderToStaticMarkup(await EmployerAgendaPage());
    expect(html).toContain("Carga y descarga");
    expect(html).toContain("Juan Torres");
  });
});

describe("12. EmployerAgendaPage — multi-role", () => {
  it("un usuario multi-role con modo activo 'worker' SÍ accede a su agenda de empleador porque posee ambos roles", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "multi-1" },
      profile: { id: "multi-1", role: "worker" } as never,
      userRoles: ["worker", "employer"],
    });
    vi.mocked(getMyCalendar).mockResolvedValue({ asWorker: [], asEmployer: [] });

    const html = renderToStaticMarkup(await EmployerAgendaPage());
    expect(html).toContain("Mi agenda");
  });

  it("un usuario que NO posee el rol employer es redirigido", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "worker-1" },
      profile: { id: "worker-1", role: "worker" } as never,
      userRoles: ["worker"],
    });
    await expect(EmployerAgendaPage()).rejects.toThrow("REDIRECT:/dashboard");
  });
});
