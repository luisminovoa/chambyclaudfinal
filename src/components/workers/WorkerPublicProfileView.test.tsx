import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkerPublicProfileView } from "./WorkerPublicProfileView";
import type { WorkerPublicProfile } from "@/lib/actions/workers";

// Evita depender del AppRouterContext real de Next.js (no montado en este
// render aislado) — mismo patrón ya usado en EmployerPublicProfileView.test.tsx.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseData: WorkerPublicProfile = {
  profile: {
    id: "worker-1",
    full_name: "Juana Pérez",
    avatar_url: null,
    city: "Chiclayo",
    category: "Electricista",
    skills: ["Instalaciones", "Mantenimiento"],
    bio: "Electricista con 5 años de experiencia.",
    created_at: "2020-01-01T00:00:00Z",
  },
  workerDetails: null,
  photos: [],
  experience: [],
  stats: null,
  ratingSummary: null,
  jobsCompleted: 2,
  application: null,
  jobId: null,
  conversationId: null,
  viewerIsEmployer: false,
};

/**
 * Fase 2 / C4-G11 — este componente es exactamente el que un empleador ve
 * antes de decidir contratar, y es el que originó el reporte real del
 * usuario: sin ninguna insignia ganada, VerificationBadges devolvía
 * `null` y la sección de verificación desaparecía por completo, sin
 * distinguir "no verificado" de "esta información no existe". Este
 * archivo no existía antes de esta fase (confirmado en la auditoría
 * C4-G11) — es la primera cobertura de este componente.
 */
describe("WorkerPublicProfileView — estado de verificación siempre visible (Fase 2 / C4-G11)", () => {
  it("A) un worker sin badges sigue mostrando la sección de verificación (no desaparece)", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).toContain(">Verificación</h2>");
  });

  it("B) aparecen las tres verificaciones documentales: Identidad, RUC y Certificación profesional", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).toContain(">Identidad</p>");
    expect(html).toContain(">RUC</p>");
    expect(html).toContain(">Certificación profesional</p>");
  });

  it("C) los badges existentes se reflejan como Verificado/a", () => {
    const html = renderToStaticMarkup(
      <WorkerPublicProfileView
        data={{
          ...baseData,
          stats: {
            profile_id: "worker-1",
            completion_percentage: 60,
            trust_score: 66,
            badges: ["identity_verified", "ruc_active"],
            updated_at: "2020-01-01T00:00:00Z",
          },
        }}
      />
    );
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?>Verificada</);
    expect(html).toMatch(/RUC<\/p>[\s\S]*?>Verificado</);
  });

  it("D) los ausentes se reflejan como No verificado/a — incluido el caso stats=null (sin ningún profile_stats calculado todavía)", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?>No verificada</);
    expect(html).toMatch(/RUC<\/p>[\s\S]*?>No verificado</);
    expect(html).toMatch(/Certificación profesional<\/p>[\s\S]*?>No verificada</);
  });

  it("E) top_profile aparece solo cuando corresponde (badge presente en profile_stats.badges)", () => {
    const html = renderToStaticMarkup(
      <WorkerPublicProfileView
        data={{
          ...baseData,
          stats: {
            profile_id: "worker-1",
            completion_percentage: 85,
            trust_score: 90,
            badges: ["top_profile"],
            updated_at: "2020-01-01T00:00:00Z",
          },
        }}
      />
    );
    expect(html).toContain("Perfil destacado");
  });

  it("F) no aparece 'Perfil no destacado' ni ninguna variante de 'no destacado' cuando top_profile está ausente — top_profile no es una verificación documental con opuesto binario", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).not.toContain("Perfil destacado");
    expect(html).not.toMatch(/no destacado/i);
  });

  it("G) no aparecen documentos personales (DNI, storage_path, file_name, verification-documents) en ningún punto del perfil público", () => {
    const html = renderToStaticMarkup(
      <WorkerPublicProfileView
        data={{
          ...baseData,
          stats: {
            profile_id: "worker-1",
            completion_percentage: 60,
            trust_score: 66,
            badges: ["identity_verified"],
            updated_at: "2020-01-01T00:00:00Z",
          },
        }}
      />
    );
    expect(html).not.toMatch(/storage_path|file_name|verification-documents/i);
  });

  it("H) no aparece rejection_reason ni ningún motivo de rechazo — el perfil público nunca recibe esa tabla, solo profile_stats.badges", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).not.toMatch(/rejection|illegible|expired|data_mismatch|wrong_document|reviewer/i);
  });

  it("regresión directa del bug reportado: con stats=null (caso real de un trabajador que nunca completó verificación), la sección de Verificación NO desaparece — antes de esta fase, VerificationBadges devolvía null en este escenario exacto", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={{ ...baseData, stats: null }} />);
    expect(html).toContain(">Verificación</h2>");
    expect(html).not.toBe("");
  });

  it("no se rompe el resto del perfil público (nombre, categoría, rating, experiencia) al integrar el nuevo VerificationBadges", () => {
    const html = renderToStaticMarkup(<WorkerPublicProfileView data={baseData} />);
    expect(html).toContain("Juana Pérez");
    expect(html).toContain("Electricista");
    expect(html).toContain("Sin calificaciones aún");
  });
});
