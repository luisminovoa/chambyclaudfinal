import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkerProfileActions } from "./WorkerProfileActions";

// Mismo patrón que RegisterForm.test.tsx/page.test.tsx: evita depender del
// AppRouterContext real de Next.js en un render aislado con
// renderToStaticMarkup.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// updateApplicationStatus() es una Server Action — no se invoca en estos
// tests (solo se renderiza el componente, nunca se dispara un click real),
// pero el import estático necesita una referencia válida.
vi.mock("@/lib/actions/jobs", () => ({
  updateApplicationStatus: vi.fn(),
}));

const baseProps = {
  workerId: "worker-1",
  workerName: "Ana Trabajadora",
  application: null as { id: string; status: string } | null,
  conversationId: null as string | null,
  canManage: false,
};

describe("WorkerProfileActions — Guardar trabajador sin jobId (Fase C4-G5)", () => {
  it("A) con jobId=null, 'Guardar trabajador' aparece", () => {
    const html = renderToStaticMarkup(<WorkerProfileActions {...baseProps} jobId={null} />);
    expect(html).toContain("Guardar trabajador");
  });

  it("B) con jobId=null, 'Iniciar chat' NO aparece", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions {...baseProps} jobId={null} conversationId={null} />
    );
    expect(html).not.toContain("Iniciar chat");
  });

  it("B) con jobId=null, 'Aceptar' NO aparece aunque canManage llegue en true (defensivo)", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId={null}
        canManage={true}
        application={{ id: "app-1", status: "pendiente" }}
      />
    );
    expect(html).not.toContain(">Aceptar<");
  });

  it("B) con jobId=null, 'Rechazar' NO aparece aunque canManage llegue en true (defensivo)", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId={null}
        canManage={true}
        application={{ id: "app-1", status: "pendiente" }}
      />
    );
    expect(html).not.toContain(">Rechazar<");
  });

  it("con jobId=null, 'Volver a la publicación' tampoco aparece (no hay publicación a la que volver)", () => {
    const html = renderToStaticMarkup(<WorkerProfileActions {...baseProps} jobId={null} />);
    expect(html).not.toContain("Volver a la publicación");
  });
});

describe("WorkerProfileActions — comportamiento con jobId intacto (Fase C4-G5)", () => {
  it("C) con jobId válido, 'Guardar trabajador' sigue apareciendo", () => {
    const html = renderToStaticMarkup(<WorkerProfileActions {...baseProps} jobId="job-1" />);
    expect(html).toContain("Guardar trabajador");
  });

  it("D) con jobId válido y conversationId, 'Iniciar chat' sigue apareciendo", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions {...baseProps} jobId="job-1" conversationId="conv-1" />
    );
    expect(html).toContain("Iniciar chat");
  });

  it("D) con jobId válido, canManage=true y postulación pendiente, Aceptar/Rechazar siguen apareciendo", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId="job-1"
        canManage={true}
        application={{ id: "app-1", status: "pendiente" }}
      />
    );
    expect(html).toContain(">Aceptar<");
    expect(html).toContain(">Rechazar<");
  });

  it("D) con jobId válido pero canManage=false, Aceptar/Rechazar NO aparecen (comportamiento actual sin cambios)", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId="job-1"
        canManage={false}
        application={{ id: "app-1", status: "pendiente" }}
      />
    );
    expect(html).not.toContain(">Aceptar<");
    expect(html).not.toContain(">Rechazar<");
  });

  it("con jobId válido, 'Volver a la publicación' sigue apareciendo", () => {
    const html = renderToStaticMarkup(<WorkerProfileActions {...baseProps} jobId="job-1" />);
    expect(html).toContain("Volver a la publicación");
  });
});
