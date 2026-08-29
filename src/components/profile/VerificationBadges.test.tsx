import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VerificationBadges } from "./VerificationBadges";

/**
 * Fase 2 / C4-G11 — corrige el bug reportado por un usuario real: con
 * `badges=[]` el componente devolvía `null` (sección entera invisible),
 * así que un empleador nunca podía distinguir "este trabajador no tiene
 * nada verificado" de "esta sección no existe". Ahora las 3
 * verificaciones documentales (identidad/RUC/certificación) SIEMPRE se
 * renderizan, con su estado real — nunca se oculta la sección completa.
 * `top_profile` sigue siendo condicional (no es un documento, ver
 * comentario de VerificationBadges.tsx) y nunca se presenta con un
 * "No destacado".
 *
 * VerificationBadges no tiene "use client" (Server Component real) — se
 * renderiza directo con renderToStaticMarkup, sin mocks.
 */
describe("VerificationBadges — nunca oculta la sección completa (Fase 2 / C4-G11)", () => {
  it("A) badges=[] NO devuelve null: la card y el heading 'Verificación' siempre existen", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={[]} />);
    expect(html).not.toBe("");
    expect(html).toContain(">Verificación</h2>");
  });

  it("J) badges=[] no retorna null (verificación explícita del bug original): las 3 filas documentales están presentes, todas en estado 'No verificada/o'", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={[]} />);
    expect(html).toContain(">Identidad</p>");
    expect(html).toContain(">RUC</p>");
    expect(html).toContain(">Certificación profesional</p>");
    expect(html).toContain("No verificada");
    expect(html).toContain("No verificado");
  });

  it("B) identity_verified presente: Identidad = Verificada, RUC y Certificación siguen No verificado/a", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["identity_verified"]} />);
    expect(html).toContain(">Identidad</p>");
    expect(html).toMatch(/Identidad<\/p>[\s\S]*?Verificada/);
    // RUC y certificación permanecen sin verificar (ninguna otra fila cambió)
    expect((html.match(/No verificad[oa]/g) ?? []).length).toBe(2);
  });

  it("C) ruc_active presente: RUC = Verificado, el resto no verificado", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["ruc_active"]} />);
    expect(html).toMatch(/RUC<\/p>[\s\S]*?Verificado(?!\s)/);
    expect((html.match(/No verificad[oa]/g) ?? []).length).toBe(2);
  });

  it("D) certified_professional presente: Certificación profesional = Verificada, el resto no verificado", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["certified_professional"]} />);
    expect(html).toMatch(/Certificación profesional<\/p>[\s\S]*?Verificada/);
    expect((html.match(/No verificad[oa]/g) ?? []).length).toBe(2);
  });

  it("E) las 3 verificaciones documentales presentes: ninguna fila queda en 'No verificado/a'", () => {
    const html = renderToStaticMarkup(
      <VerificationBadges badges={["identity_verified", "ruc_active", "certified_professional"]} />
    );
    expect(html).not.toContain("No verificada");
    expect(html).not.toContain("No verificado");
  });

  it("F) top_profile presente (junto a las 3 verificaciones): aparece 'Perfil destacado'", () => {
    const html = renderToStaticMarkup(
      <VerificationBadges
        badges={["identity_verified", "ruc_active", "certified_professional", "top_profile"]}
      />
    );
    expect(html).toContain("Perfil destacado");
  });

  it("G) top_profile ausente: NO aparece 'Perfil destacado' ni ningún texto de 'No destacado'", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["identity_verified"]} />);
    expect(html).not.toContain("Perfil destacado");
    expect(html).not.toMatch(/No destacado/i);
  });

  it("G.2) badges=[] tampoco muestra 'Perfil destacado' ni 'No destacado' — top_profile es puramente condicional, nunca una cuarta fila fija", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={[]} />);
    expect(html).not.toContain("Perfil destacado");
    expect(html).not.toMatch(/No destacado/i);
  });

  it("H) combinación parcial (ruc_active + top_profile, sin identity_verified ni certified_professional): cada fila refleja su propio estado de forma independiente", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["ruc_active", "top_profile"]} />);
    expect(html).toMatch(/RUC<\/p>[\s\S]*?Verificado(?!\s)/);
    expect((html.match(/No verificad[oa]/g) ?? []).length).toBe(2);
    expect(html).toContain("Perfil destacado");
  });

  it("I) un valor desconocido en el array no rompe el render ni afecta las filas conocidas", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["algo_inventado", "ruc_active"]} />);
    expect(html).toMatch(/RUC<\/p>[\s\S]*?Verificado(?!\s)/);
    expect(html).not.toContain("algo_inventado");
  });

  it("I.2) un array compuesto únicamente por valores desconocidos se comporta igual que badges=[] (las 3 filas quedan sin verificar, sin romper)", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["algo_inventado", "otro_valor"]} />);
    expect((html.match(/No verificad[oa]/g) ?? []).length).toBe(3);
  });

  it("K) los textos de estado son exactamente los gramaticalmente correctos: 'Verificada'/'Verificado' cuando corresponde, 'No verificada'/'No verificado' cuando no", () => {
    const htmlAllVerified = renderToStaticMarkup(
      <VerificationBadges badges={["identity_verified", "ruc_active", "certified_professional"]} />
    );
    expect(htmlAllVerified).toMatch(/Identidad<\/p>[\s\S]*?>Verificada</);
    expect(htmlAllVerified).toMatch(/RUC<\/p>[\s\S]*?>Verificado</);
    expect(htmlAllVerified).toMatch(/Certificación profesional<\/p>[\s\S]*?>Verificada</);

    const htmlNoneVerified = renderToStaticMarkup(<VerificationBadges badges={[]} />);
    expect(htmlNoneVerified).toMatch(/Identidad<\/p>[\s\S]*?>No verificada</);
    expect(htmlNoneVerified).toMatch(/RUC<\/p>[\s\S]*?>No verificado</);
    expect(htmlNoneVerified).toMatch(/Certificación profesional<\/p>[\s\S]*?>No verificada</);
  });

  it("no expone rejection_reason, reviewer, ni ningún dato de verification_documents/verification_document_reviews — el componente solo recibe un array de strings (badges), nunca esas tablas", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["ruc_active"]} />);
    expect(html).not.toMatch(/rejection|reviewer|reviewed_by|illegible|expired|data_mismatch|wrong_document/i);
  });

  it("no expone ningún documento personal (DNI, storage_path, file_name) — solo iconos y texto de estado", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["identity_verified"]} />);
    expect(html).not.toMatch(/storage_path|file_name|dni\b/i);
  });

  it("no aparece ningún estado 'pendiente'/'en revisión' públicamente — esta fase no amplía el contrato de VerificationBadges para recibir verification_documents.status", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={[]} />);
    expect(html).not.toMatch(/pendiente|en revisión/i);
  });

  it("reutiliza BADGE_CONFIG (icono/color) sin duplicar el catálogo: las clases de color de un badge ganado coinciden con las ya definidas en badge-config.ts para ese mismo badge", () => {
    const html = renderToStaticMarkup(<VerificationBadges badges={["identity_verified"]} />);
    // identity_verified usa text-primary-600 en BADGE_CONFIG — se refleja en el ícono/estado ganado.
    expect(html).toContain("text-primary-600");
  });
});
