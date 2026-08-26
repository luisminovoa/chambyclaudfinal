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

  it("B) con jobId=null y sin hiringConversations, '💬 Abrir chat' NO aparece", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions {...baseProps} jobId={null} conversationId={null} />
    );
    expect(html).not.toContain("Abrir chat");
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

  it("D) con jobId válido y conversationId, '💬 Abrir chat' sigue apareciendo (antes 'Iniciar chat', renombrado en C4-G6)", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions {...baseProps} jobId="job-1" conversationId="conv-1" />
    );
    expect(html).toContain("Abrir chat");
    expect(html).toMatch(/<a href="\/messages\/conv-1"/);
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

describe("WorkerProfileActions — hiringConversations sin jobId (Fase C4-G6)", () => {
  it("sin conversaciones, no muestra ningún botón de chat", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions {...baseProps} jobId={null} hiringConversations={[]} />
    );
    expect(html).not.toContain("Abrir chat");
  });

  it("con una sola conversación, muestra un único '💬 Abrir chat' hacia esa conversación", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId={null}
        hiringConversations={[{ conversationId: "conv-1", jobId: "job-1", jobTitle: "Electricista para local" }]}
      />
    );
    expect(html).toContain("💬 Abrir chat");
    expect(html).toMatch(/<a href="\/messages\/conv-1"/);
    // Con una sola conversación no se muestra la lista con título de chamba.
    expect(html).not.toContain("Conversaciones");
  });

  it("con varias conversaciones, muestra una lista 'Conversaciones' con un botón por chamba — nunca elige una arbitrariamente", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId={null}
        hiringConversations={[
          { conversationId: "conv-a", jobId: "job-a", jobTitle: "Chamba A" },
          { conversationId: "conv-b", jobId: "job-b", jobTitle: "Chamba B" },
        ]}
      />
    );
    expect(html).toContain("Conversaciones");
    expect(html).toContain("Chamba A");
    expect(html).toContain("Chamba B");
    expect(html).toMatch(/<a href="\/messages\/conv-a"/);
    expect(html).toMatch(/<a href="\/messages\/conv-b"/);
  });

  it("con jobId presente, hiringConversations se ignora (el flujo de un job puntual manda)", () => {
    const html = renderToStaticMarkup(
      <WorkerProfileActions
        {...baseProps}
        jobId="job-1"
        conversationId={null}
        hiringConversations={[
          { conversationId: "conv-a", jobId: "job-a", jobTitle: "Chamba A" },
          { conversationId: "conv-b", jobId: "job-b", jobTitle: "Chamba B" },
        ]}
      />
    );
    expect(html).not.toContain("Conversaciones");
    expect(html).not.toContain("Chamba A");
  });
});
