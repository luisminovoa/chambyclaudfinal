import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { getMainNavItems, getBrowseTab, getProfileHref } from "./main-nav";
import { ADMIN_NAV_TABS } from "./admin-nav";

const labels = (role: Parameters<typeof getMainNavItems>[0]) =>
  getMainNavItems(role).map((i) => i.label);
const hrefs = (role: Parameters<typeof getMainNavItems>[0]) =>
  getMainNavItems(role).map((i) => i.href);

describe("getMainNavItems — navegación de escritorio por modo activo", () => {
  it("1. worker ve 'Buscar trabajos' hacia /jobs", () => {
    expect(labels("worker")).toContain("Buscar trabajos");
    expect(hrefs("worker")).toContain("/jobs");
  });

  it("2. employer NO ve 'Buscar trabajos' (es una acción de trabajador)", () => {
    expect(labels("employer")).not.toContain("Buscar trabajos");
    expect(hrefs("employer")).not.toContain("/jobs");
  });

  it("3. employer ve 'Mis publicaciones' hacia /dashboard/employer", () => {
    expect(labels("employer")).toContain("Mis publicaciones");
    expect(hrefs("employer")).toContain("/dashboard/employer");
  });

  it("4. employer ve 'Publicar trabajo' hacia /jobs/new", () => {
    expect(labels("employer")).toContain("Publicar trabajo");
    expect(hrefs("employer")).toContain("/jobs/new");
  });

  it("5. employer ve 'Buscar trabajadores' hacia /workers (Fase 3 del directorio)", () => {
    expect(labels("employer")).toContain("Buscar trabajadores");
    expect(hrefs("employer")).toContain("/workers");
  });

  it("un visitante sin sesión conserva la navegación de trabajador (comportamiento actual)", () => {
    expect(labels(null)).toEqual(labels("worker"));
  });
});

describe("multirol — la navegación depende del modo activo, no de los roles poseídos", () => {
  // getMainNavItems recibe únicamente el modo activo (profiles.role): por
  // construcción, poseer ambos roles no puede alterar la barra. Estos dos
  // casos fijan ese contrato para que nadie lo cambie sin darse cuenta.
  it("6. worker+employer en modo worker ve exactamente la navegación de trabajador", () => {
    expect(getMainNavItems("worker")).toEqual(getMainNavItems("worker"));
    expect(labels("worker")).toEqual(["Buscar trabajos"]);
  });

  it("7. worker+employer en modo employer ve exactamente la navegación de empleador", () => {
    expect(labels("employer")).toEqual(["Buscar trabajadores", "Mis publicaciones", "Publicar trabajo"]);
  });

  it("nunca se mezclan los dos modos en la misma barra", () => {
    const worker = labels("worker");
    const employer = labels("employer");
    expect(worker.some((l) => employer.includes(l))).toBe(false);
  });
});

describe("admin — navegación intacta", () => {
  it("8. admin conserva sus secciones de ADMIN_NAV_TABS, sin cambios", () => {
    expect(ADMIN_NAV_TABS.map((t) => t.href)).toEqual([
      "/admin",
      "/admin/users",
      "/admin/verifications",
      "/admin/reports",
      "/admin/jobs",
      "/admin/beta",
    ]);
  });

  it("getMainNavItems no filtra ningún enlace de worker/employer hacia admin", () => {
    expect(getMainNavItems("admin")).toEqual([]);
  });

  it("el BottomNav de admin conserva 'Buscar' hacia /jobs (comportamiento actual)", () => {
    expect(getBrowseTab("admin")).toMatchObject({ href: "/jobs", label: "Buscar" });
  });
});

describe("getBrowseTab — segunda pestaña del BottomNav (móvil)", () => {
  it("worker: 'Buscar' hacia /jobs", () => {
    expect(getBrowseTab("worker")).toMatchObject({ href: "/jobs", label: "Buscar" });
  });

  it("employer: 'Publicaciones' hacia /dashboard/employer, nunca /jobs", () => {
    expect(getBrowseTab("employer")).toMatchObject({
      href: "/dashboard/employer",
      label: "Publicaciones",
    });
  });

  it("employer: la pestaña móvil sigue siendo 'Publicaciones', no /workers (decisión de Fase 3: el directorio se agrega al Navbar de escritorio, no reemplaza la pestaña móvil de un solo slot)", () => {
    expect(getBrowseTab("employer").href.startsWith("/workers")).toBe(false);
  });

  it("visitante sin sesión conserva 'Buscar' hacia /jobs", () => {
    expect(getBrowseTab(null)).toMatchObject({ href: "/jobs", label: "Buscar" });
  });
});

describe("getProfileHref — destino de 'Mi Perfil' según el modo activo", () => {
  it("10.A worker puro -> /dashboard/worker/profile", () => {
    expect(getProfileHref("worker")).toBe("/dashboard/worker/profile");
  });

  it("10.B employer puro -> /dashboard/employer/profile (antes rebotaba a /dashboard)", () => {
    expect(getProfileHref("employer")).toBe("/dashboard/employer/profile");
  });

  it("10.C worker+employer en modo worker -> perfil de trabajador", () => {
    expect(getProfileHref("worker")).toBe("/dashboard/worker/profile");
  });

  it("10.D worker+employer en modo employer -> perfil de empleador", () => {
    expect(getProfileHref("employer")).toBe("/dashboard/employer/profile");
  });

  it("admin conserva su destino actual, sin cambios", () => {
    expect(getProfileHref("admin")).toBe("/dashboard/worker/profile");
  });
});

describe("9. ningún enlace apunta a una ruta inexistente", () => {
  // Verificación contra el árbol real de src/app: es el test que impide
  // publicar "Buscar trabajadores" antes de que /workers exista (PR 3).
  const appDir = path.resolve(__dirname, "../app");
  const routeExists = (href: string) => {
    const routePath = href.split("?")[0].replace(/^\//, "");
    return existsSync(path.join(appDir, routePath, "page.tsx"));
  };

  const allHrefs = [
    ...getMainNavItems("worker"),
    ...getMainNavItems("employer"),
    getBrowseTab("worker"),
    getBrowseTab("employer"),
    getBrowseTab(null),
  ].map((i) => i.href);

  it.each([...new Set(allHrefs)])("existe la página para %s", (href) => {
    expect(routeExists(href)).toBe(true);
  });

  it.each(["worker", "employer", "admin", null] as const)(
    "existe la página del perfil para el modo %s",
    (role) => {
      expect(routeExists(getProfileHref(role))).toBe(true);
    }
  );
});
