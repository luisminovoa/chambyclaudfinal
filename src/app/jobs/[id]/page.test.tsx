import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobDetailPage, { generateMetadata } from "./page";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

/**
 * Fase 6 (C4-G18) — /jobs/[id] debe usar formatLocation() para
 * presentación (título, header) y `district || city` para
 * addressLocality (JSON-LD, campo semántico de localidad — nunca la
 * cadena completa "Distrito, Provincia, Departamento"). Visitante
 * anónimo, job abierto, sin trabajador asignado — no ejerce las ramas
 * de #rating/RatingForm/JobActions (sin tocar esa lógica, ver
 * CLAUDE.md FASE 6, archivos prohibidos).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/get-current-profile", () => ({
  getCurrentUserAndProfile: vi.fn(),
}));

const BASE_JOB = {
  id: "job-1",
  employer_id: "employer-1",
  title: "Electricista para instalación",
  description: "Se busca electricista con experiencia.",
  category: "Electricista",
  city: "Chiclayo",
  department: null as string | null,
  province: null as string | null,
  district: null as string | null,
  address: null,
  pay_amount: 100,
  pay_type: "por_dia",
  status: "abierto",
  positions_needed: 1,
  assigned_worker_id: null,
  starts_at: null,
  hired_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

let mockJob: typeof BASE_JOB | null = BASE_JOB;

function makeSingleBuilder(getData: () => unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: getData() }),
    maybeSingle: async () => ({ data: getData() }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "jobs") return makeSingleBuilder(() => mockJob);
      if (table === "public_profiles")
        return makeSingleBuilder(() => ({
          id: "employer-1",
          full_name: "Jose Ramirez",
          avatar_url: null,
          city: "Chiclayo",
        }));
      if (table === "rating_summary") return makeSingleBuilder(() => null);
      throw new Error(`tabla inesperada en el mock de /jobs/[id]: ${table}`);
    },
  }),
  createAdminClient: () => ({
    from: () => {
      throw new Error("createAdminClient no debería usarse para un visitante anónimo");
    },
  }),
}));

describe("/jobs/[id] — ubicación jerárquica (Fase 6 / C4-G18)", () => {
  beforeEach(() => {
    mockJob = { ...BASE_JOB };
    vi.mocked(getCurrentUserAndProfile).mockResolvedValue({
      user: null,
      profile: null,
      userRoles: [],
    });
  });

  it("full location: header muestra 'Distrito, Provincia, Departamento'", async () => {
    mockJob = { ...BASE_JOB, department: "Lambayeque", province: "Chiclayo", district: "Cayaltí" };
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    expect(html).toContain("Cayaltí, Chiclayo, Lambayeque");
  });

  it("legacy city: sin Ubigeo, el header muestra city tal cual", async () => {
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    expect(html).toContain("Chiclayo");
  });

  it("no location: sin Ubigeo ni city, la presentación visible no renderiza null/undefined (el JSON-LD sí puede llevar addressLocality:null, es JSON válido, no texto visible)", async () => {
    mockJob = { ...BASE_JOB, city: null as unknown as string };
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    const visibleHtml = html.replace(/<script[^>]*>.*?<\/script>/s, "");
    expect(visibleHtml).not.toContain("null");
    expect(visibleHtml).not.toContain("undefined");
  });

  it("title: el <h1> del trabajo sigue presente sin cambios", async () => {
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    expect(html).toContain("Electricista para instalación");
  });

  it("JSON-LD: addressLocality usa district || city, nunca la cadena completa de formatLocation", async () => {
    mockJob = { ...BASE_JOB, department: "Lambayeque", province: "Chiclayo", district: "Cayaltí" };
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    expect(jsonLdMatch).not.toBeNull();
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd.jobLocation.address.addressLocality).toBe("Cayaltí");
    expect(jsonLd.jobLocation.address.addressLocality).not.toBe("Cayaltí, Chiclayo, Lambayeque");
  });

  it("JSON-LD: addressLocality cae a city cuando no hay district (legacy)", async () => {
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd.jobLocation.address.addressLocality).toBe("Chiclayo");
  });

  it("generateMetadata: el título usa la ubicación jerárquica cuando existe", async () => {
    mockJob = { ...BASE_JOB, department: "Lambayeque", province: "Chiclayo", district: "Cayaltí" };
    const metadata = await generateMetadata({ params: { id: "job-1" } });
    expect(metadata.title).toBe("Electricista para instalación en Cayaltí, Chiclayo, Lambayeque");
  });

  it("generateMetadata: el título cae a city cuando no hay Ubigeo (legacy)", async () => {
    const metadata = await generateMetadata({ params: { id: "job-1" } });
    expect(metadata.title).toBe("Electricista para instalación en Chiclayo");
  });

  it("no toca el flujo de calificación: sin trabajo completado, no aparece #rating/RatingForm", async () => {
    const html = renderToStaticMarkup(await JobDetailPage({ params: { id: "job-1" } }));
    expect(html).not.toContain('id="rating"');
  });
});
