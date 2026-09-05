import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkerAgendaPage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMyCalendar } from "@/lib/actions/calendar";

/** FASE 3G — Sección 2 + Sección 4 (multi-role, test §15 item 12). */

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

describe("1. WorkerAgendaPage — renderiza trabajos agendados", () => {
  it("muestra los trabajos de asWorker devueltos por getMyCalendar()", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "worker-1" },
      profile: { id: "worker-1", role: "worker" } as never,
      userRoles: ["worker"],
    });
    vi.mocked(getMyCalendar).mockResolvedValue({
      asWorker: [
        {
          id: "job-1",
          title: "Ayudante de almacén",
          status: "en_progreso",
          scheduled_start_at: "2099-01-01T09:00:00.000Z",
          scheduled_end_at: "2099-01-01T13:00:00.000Z",
          city: "Chiclayo",
          district: "Chiclayo",
          counterpartName: "Empresa X",
        },
      ],
      asEmployer: [],
    });

    const html = renderToStaticMarkup(await WorkerAgendaPage());
    expect(html).toContain("Ayudante de almacén");
    expect(html).toContain("Mi agenda");
  });
});

describe("3. WorkerAgendaPage — agenda vacía", () => {
  it("sin trabajos agendados muestra el EmptyState", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "worker-1" },
      profile: { id: "worker-1", role: "worker" } as never,
      userRoles: ["worker"],
    });
    vi.mocked(getMyCalendar).mockResolvedValue({ asWorker: [], asEmployer: [] });

    const html = renderToStaticMarkup(await WorkerAgendaPage());
    expect(html).toContain("Tu agenda está libre");
  });
});

describe("4. Sección de acceso: gating por rol POSEÍDO (user_roles), no por profiles.role", () => {
  it("un usuario sin sesión es redirigido a login", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({ user: null, profile: null, userRoles: [] });
    await expect(WorkerAgendaPage()).rejects.toThrow("REDIRECT:/login?next=/dashboard/worker/agenda");
  });

  it("un usuario que NO posee el rol worker es redirigido, aunque profiles.role diga otra cosa", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "employer-1" },
      profile: { id: "employer-1", role: "employer" } as never,
      userRoles: ["employer"],
    });
    await expect(WorkerAgendaPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("12. un usuario multi-role con modo activo 'employer' (profiles.role='employer') SÍ accede a su agenda de worker porque posee ambos roles", async () => {
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: { id: "multi-1" },
      // El modo activo dice 'employer' — si esta página dependiera de
      // profiles.role en vez de userRoles, esto redirigiría por error.
      profile: { id: "multi-1", role: "employer" } as never,
      userRoles: ["worker", "employer"],
    });
    vi.mocked(getMyCalendar).mockResolvedValue({ asWorker: [], asEmployer: [] });

    const html = renderToStaticMarkup(await WorkerAgendaPage());
    expect(html).toContain("Mi agenda");
  });
});
