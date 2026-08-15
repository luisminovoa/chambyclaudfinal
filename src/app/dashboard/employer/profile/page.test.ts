import { describe, expect, it, vi, beforeEach } from "vitest";
import EmployerProfilePage from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import type { Profile, UserRole } from "@/lib/types";

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

vi.mock("@/lib/actions/profile", () => ({
  getProfilePhotos: vi.fn().mockResolvedValue([]),
  getVerificationDocuments: vi.fn().mockResolvedValue([]),
  getProfileStats: vi.fn().mockResolvedValue(null),
  computeAndSaveProfileStats: vi.fn().mockResolvedValue({ success: true, stats: null }),
}));

// Mismo criterio que roles.test.ts: redirect() real de Next.js aborta la
// ejecución lanzando — el mock debe hacer lo mismo para que esta prueba
// refleje el comportamiento real de la página (si no lanzara, el código
// posterior al redirect() se seguiría ejecutando, algo que nunca pasa
// en producción).
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const EMPLOYER_PROFILE: Profile = {
  id: "employer-1",
  role: "employer",
  full_name: "Ferretería Don Jose",
  phone: null,
  city: "Lima",
  category: null,
  skills: [],
  bio: null,
  avatar_url: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  employer_type: null,
  business_name: null,
  business_sector: null,
  business_description: null,
  business_ruc: null,
  district: null,
};

function mockSession(user: { id: string } | null, profile: Profile | null, userRoles: UserRole[]) {
  vi.mocked(getCurrentUserAndProfile).mockResolvedValue({ user, profile, userRoles });
}

describe("/dashboard/employer/profile — gating por rol poseído (no por modo activo)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("un usuario con el rol employer accede, sin importar si su modo activo es worker", async () => {
    mockSession({ id: "employer-1" }, { ...EMPLOYER_PROFILE, role: "worker" }, ["worker", "employer"]);

    const result = await EmployerProfilePage();

    expect((result as { props: { profile: Profile } }).props.profile.id).toBe("employer-1");
  });

  it("un usuario con modo activo employer (caso simple) accede", async () => {
    mockSession({ id: "employer-1" }, EMPLOYER_PROFILE, ["employer"]);

    const result = await EmployerProfilePage();

    expect((result as { props: { profile: Profile } }).props.profile.id).toBe("employer-1");
  });

  it("un worker que NUNCA poseyó el rol employer es redirigido a /dashboard", async () => {
    mockSession(
      { id: "worker-1" },
      { ...EMPLOYER_PROFILE, id: "worker-1", role: "worker" },
      ["worker"]
    );

    await expect(EmployerProfilePage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("un usuario sin sesión es redirigido a /login", async () => {
    mockSession(null, null, []);

    await expect(EmployerProfilePage()).rejects.toThrow("REDIRECT:/login?next=/dashboard/employer/profile");
  });
});
