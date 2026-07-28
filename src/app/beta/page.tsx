import type { Metadata } from "next";
import { CheckSquare, Bug, ChevronRight } from "lucide-react";
import { BETA_CONFIG } from "@/lib/beta-config";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Guía de Beta Privada | Chamby",
  robots: { index: false },
};

const SCENARIOS = [
  {
    id: 1,
    title: "Registro de cuenta",
    steps: [
      'Abre la app y presiona "Crear cuenta".',
      "Completa el formulario con nombre real, email y contraseña.",
      'Elige tu rol: "Trabajador" (busco trabajo) o "Empleador" (busco trabajadores).',
      "Verifica que llegas al dashboard correctamente.",
    ],
    check: "¿El formulario es claro? ¿El proceso es fluido?",
  },
  {
    id: 2,
    title: "Inicio de sesión",
    steps: [
      "Cierra sesión desde el botón de salida.",
      'Vuelve a entrar con "Ingresar".',
      "Usa tus credenciales correctas.",
      "Verifica que te redirige al dashboard.",
    ],
    check: "¿El login es rápido? ¿Los errores son claros?",
  },
  {
    id: 3,
    title: "Publicar un trabajo (Empleador)",
    steps: [
      'Entra con una cuenta de tipo "Empleador".',
      'Presiona "Publicar trabajo".',
      "Completa todos los campos: título, descripción, categoría, ciudad, pago.",
      'Presiona "Publicar".',
      "Verifica que el trabajo aparece en el listado.",
    ],
    check: "¿El formulario es intuitivo? ¿Todos los campos son claros?",
  },
  {
    id: 4,
    title: "Buscar un trabajo (Trabajador)",
    steps: [
      'Entra con una cuenta de tipo "Trabajador".',
      'Ve a "Buscar trabajos".',
      "Usa los filtros de categoría y ciudad.",
      "Abre el detalle de un trabajo.",
    ],
    check: "¿Los resultados son correctos? ¿Los filtros funcionan?",
  },
  {
    id: 5,
    title: "Postularse a un trabajo",
    steps: [
      "Como trabajador, abre el detalle de un trabajo abierto.",
      'Presiona "Postularme".',
      "Agrega un mensaje de presentación (opcional).",
      'Confirma con "Enviar postulación".',
      "Verifica que aparece como postulación enviada.",
    ],
    check: "¿El flujo es claro? ¿El trabajador recibe confirmación?",
  },
  {
    id: 6,
    title: "Aceptar a un trabajador (Empleador)",
    steps: [
      "Como empleador, ve al dashboard.",
      "Abre el trabajo que tiene postulaciones.",
      "Revisa los perfiles de los postulantes.",
      'Acepta a uno presionando "Aceptar".',
      "Verifica que el trabajo pasa a estado En progreso.",
      "Verifica que el trabajador aceptado recibió una notificación.",
    ],
    check: "¿El empleador puede comparar postulantes? ¿La notificación llega?",
  },
  {
    id: 7,
    title: "Enviar mensajes",
    steps: [
      "Tras una aceptación, entra al chat desde el dashboard.",
      "Envía al menos 3 mensajes de texto.",
      "Prueba enviar una imagen.",
      "Verifica que el otro participante recibe los mensajes en tiempo real.",
    ],
    check: "¿El chat carga rápido? ¿Los mensajes llegan sin recargar?",
  },
  {
    id: 8,
    title: "Completar un trabajo",
    steps: [
      "Como empleador, abre el trabajo en progreso.",
      'Presiona "Marcar como completado".',
      "Verifica que el estado cambia a Completado.",
      "Verifica que el trabajador recibió una notificación.",
    ],
    check: "¿El flujo de cierre es intuitivo?",
  },
  {
    id: 9,
    title: "Calificar",
    steps: [
      "Tras completar un trabajo, ambas partes deben calificar.",
      "Como trabajador, califica al empleador (1-5 estrellas + comentario).",
      "Como empleador, califica al trabajador.",
      "Verifica que las calificaciones aparecen en los perfiles.",
    ],
    check: "¿El sistema de calificaciones es claro? ¿Las estrellas responden?",
  },
  {
    id: 10,
    title: "Centro de notificaciones",
    steps: [
      "Presiona la campana 🔔 en la barra superior.",
      "Revisa que las notificaciones de los pasos anteriores aparecen.",
      'Presiona "Marcar todo como leído".',
      "Entra a /notifications para ver el historial completo.",
    ],
    check: "¿Las notificaciones son claras? ¿El badge se actualiza en tiempo real?",
  },
];

export default function BetaGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <Reveal>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border border-warning-300 bg-warning-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-700">
            {BETA_CONFIG.stage} · {BETA_CONFIG.version}
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Guía de pruebas beta
        </h1>
        <p className="mt-2 text-ink-muted">
          Hola, beta tester. Gracias por ayudarnos a mejorar Chamby.
          Tu misión es recorrer los escenarios de abajo y reportar cualquier cosa
          que no funcione, se vea rara o sea confusa.{" "}
          <strong className="text-ink">No hay respuestas incorrectas</strong> — si algo
          te parece difícil, ese es exactamente el feedback que necesitamos.
        </p>
      </Reveal>

      {/* How to report */}
      <Reveal delay={0.05}>
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4">
          <Bug className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" />
          <div>
            <p className="text-sm font-semibold text-danger-800">Cómo reportar un error</p>
            <p className="mt-0.5 text-sm text-danger-700">
              En cualquier pantalla encontrarás un botón con el ícono de bug{" "}
              <Bug className="inline h-3.5 w-3.5" /> en la esquina inferior derecha.
              Presiónalo, describe lo que pasó y envía. El sistema captura automáticamente
              la página, el navegador y la versión.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Scenarios */}
      <div className="mt-8 space-y-4">
        {SCENARIOS.map((s, i) => (
          <Reveal key={s.id} delay={Math.min(i * 0.04, 0.2)}>
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-extrabold text-white">
                  {s.id}
                </span>
                <h2 className="font-bold text-ink">{s.title}</h2>
              </div>

              <ol className="space-y-2">
                {s.steps.map((step, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-ink-muted">
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
                    {step}
                  </li>
                ))}
              </ol>

              <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary-50 px-3 py-2">
                <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <p className="text-xs text-primary-700 font-medium">{s.check}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Footer */}
      <Reveal delay={0.1}>
        <p className="mt-10 text-center text-sm text-ink-muted">
          ¿Terminaste todos los escenarios? ¡Gracias! Tu feedback es invaluable.
          <br />
          Puedes repetir los escenarios cuantas veces quieras.
        </p>
      </Reveal>
    </div>
  );
}
