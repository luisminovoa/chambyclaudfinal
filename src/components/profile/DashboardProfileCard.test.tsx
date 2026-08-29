import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardProfileCard } from "./DashboardProfileCard";
import type {
  Profile,
  ProfileStats,
  ProfilePhoto,
  VerificationDocument,
  WorkerProfileDetails,
  WorkerExperience,
  RatingSummary,
} from "@/lib/types";

/**
 * Fase 5 / C4-G16 — la auditoría C4-G15 encontró que esta card reimplementaba
 * localmente dos conceptos que ya existen en otro lugar del sistema:
 * `verificationBadge()` (estado agregado sobre `documents`, distinto de las
 * 3 insignias documentales de FASE 2) y `isFeatured = completion > 90` (un
 * umbral propio, desincronizado del real `top_profile` >= 80 calculado en
 * computeAndSaveProfileStats()). Esta suite documenta el comportamiento
 * corregido: la card ahora lee `stats.badges` — la misma fuente de verdad
 * que VerificationBadges/VerificationTab — sin recalcular nada.
 *
 * Mismo patrón que el resto del repositorio (sin jsdom, ver CLAUDE.md):
 * DashboardProfileCard y VerificationBadges son ambos Server Components
 * (sin "use client"), así que se renderizan directo con
 * renderToStaticMarkup. Solo se mockea next/link, igual que en
 * dashboard/worker/page.test.tsx, porque next/link exige un
 * AppRouterContext que no existe en un render aislado.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProfile: Profile = {
  id: "worker-1",
  role: "worker",
  full_name: "Ana Trabajadora",
  phone: null,
  city: "Lima",
  category: "Electricista",
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
  department: null,
  province: null,
};

function baseStats(overrides: Partial<ProfileStats> = {}): ProfileStats {
  return {
    profile_id: "worker-1",
    completion_percentage: 50,
    trust_score: 50,
    badges: [],
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const baseRatingSummary: RatingSummary = {
  profile_id: "worker-1",
  average_score: 4.8,
  total_ratings: 25,
};

function secretDocument(): VerificationDocument {
  return {
    id: "doc-1",
    profile_id: "worker-1",
    document_type: "dni",
    storage_path: "worker-1/secret-storage-path.pdf",
    file_name: "secret-file-name.pdf",
    status: "rejected",
    uploaded_at: "2026-01-01T00:00:00Z",
    verified_at: null,
    rejection_reason: "illegible",
    rejection_note: "nota-confidencial-de-revision",
    reviewed_by: "admin-secret-id",
    reviewed_at: "2026-01-01T00:00:00Z",
  };
}

const noop = {
  photos: [] as ProfilePhoto[],
  documents: [] as VerificationDocument[],
  workerDetails: null as WorkerProfileDetails | null,
  experience: [] as WorkerExperience[],
};

describe("DashboardProfileCard — verificación usa stats.badges (Fase 5 / C4-G16)", () => {
  it("A) stats.badges contiene identity_verified → 'Identidad'/'Verificada' aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: ["identity_verified"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?Verificada/);
  });

  it("B) stats.badges NO contiene identity_verified → 'Identidad'/'No verificada' aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: [] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?No verificada/);
  });

  it("C) stats.badges contiene ruc_active → 'RUC'/'Verificado' aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: ["ruc_active"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toMatch(/RUC<\/p>[\s\S]*?Verificado(?!\s*a)/);
  });

  it("D) stats.badges contiene certified_professional → 'Certificación profesional'/'Verificada' aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: ["certified_professional"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toMatch(/Certificación profesional<\/p>[\s\S]*?Verificada/);
  });

  it("E) los tres badges documentales presentes → ninguna fila queda en 'No verificado/a'", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: ["identity_verified", "ruc_active", "certified_professional"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toContain("No verificada");
    expect(html).not.toContain("No verificado");
  });
});

describe("DashboardProfileCard — Perfil destacado usa top_profile, no completion (Fase 5 / C4-G16)", () => {
  it("F) top_profile presente → 'Perfil destacado' aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ completion_percentage: 85, badges: ["top_profile"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toContain("Perfil destacado");
  });

  it("G) top_profile ausente → 'Perfil destacado' NO aparece", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ completion_percentage: 85, badges: [] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toContain("Perfil destacado");
  });

  it("H) completion entre 80 y 90 CON top_profile → 'Perfil destacado' SÍ aparece (antes, con el umbral local >90, no habría aparecido)", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ completion_percentage: 85, badges: ["top_profile"] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toContain("Perfil destacado");
  });

  it("I) completion superior a 90 SIN top_profile → 'Perfil destacado' NO aparece (demuestra que ya no existe el umbral local >90)", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ completion_percentage: 95, badges: [] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toContain("Perfil destacado");
  });
});

describe("DashboardProfileCard — casos límite y contenido preservado (Fase 5 / C4-G16)", () => {
  it("J) stats=null no rompe el render, y no aparece 'Perfil destacado'", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={null}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toBe("");
    expect(html).not.toContain("Perfil destacado");
    // Con stats=null, badges=[] → VerificationBadges sigue mostrando las
    // 3 filas documentales (nunca null), todas como no verificadas.
    expect(html).toContain(">Identidad</p>");
  });

  it("K) la reputación (average_score/total_ratings) se mantiene visible", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats()}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toContain("4.8");
    expect(html).toContain("25");
  });

  it("L) 'Editar Perfil' sigue presente", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats()}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).toContain("Editar Perfil");
  });

  it("M) no aparece el antiguo estado agregado propio de la card ('Sin verificar' / 'En revisión') ni el label genérico 'Verificado' como Badge suelto — la única fuente de estos textos ahora es VerificationBadges", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats({ badges: [] })}
        {...noop}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toContain("Sin verificar");
    expect(html).not.toContain("En revisión");
    // El heading "Estado" (dt) que exponía el Badge agregado ya no existe.
    expect(html).not.toContain(">Estado</dt>");
  });

  it("N) documentos crudos nunca se exponen: ni rejection_reason, ni reviewed_by, ni storage_path, ni file_name aparecen en el HTML, aunque `documents` contenga un documento con esos campos", () => {
    const html = renderToStaticMarkup(
      <DashboardProfileCard
        profile={baseProfile}
        avatarSrc={null}
        stats={baseStats()}
        photos={[]}
        documents={[secretDocument()]}
        workerDetails={null}
        experience={[]}
        ratingSummary={baseRatingSummary}
      />
    );
    expect(html).not.toContain("illegible");
    expect(html).not.toContain("nota-confidencial-de-revision");
    expect(html).not.toContain("admin-secret-id");
    expect(html).not.toContain("secret-storage-path.pdf");
    expect(html).not.toContain("secret-file-name.pdf");
    // El único dato derivado de `documents` que la card muestra es el conteo.
    expect(html).toContain(">Documentos</dt>");
  });
});

describe("DashboardProfileCard — reutiliza VerificationBadges, no una función local (Fase 5 / C4-G16)", () => {
  const source = readFileSync(new URL("./DashboardProfileCard.tsx", import.meta.url), "utf-8");

  it("la fuente importa VerificationBadges desde @/components/profile/VerificationBadges", () => {
    expect(source).toMatch(/import\s*\{\s*VerificationBadges\s*\}\s*from\s*"@\/components\/profile\/VerificationBadges"/);
  });

  it("el JSX invoca <VerificationBadges badges={badges} />, no un componente ni Badge propio equivalente", () => {
    expect(source).toMatch(/<VerificationBadges\s+badges=\{badges\}\s*\/>/);
  });

  it("no existe ninguna función local llamada verificationBadge()", () => {
    expect(source).not.toMatch(/function\s+verificationBadge\s*\(/);
  });

  it("isFeatured se deriva de badges.includes(\"top_profile\"), no de completion > 90 ni de ningún otro umbral numérico de completion", () => {
    expect(source).toMatch(/const isFeatured = badges\.includes\("top_profile"\);/);
    // Se descartan las líneas de comentario (incluida la nota histórica que
    // menciona `completion > 90` como el umbral que este cambio reemplaza)
    // para verificar únicamente el código ejecutable.
    const codeLines = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(codeLines).not.toMatch(/completion\s*>\s*90/);
  });
});
