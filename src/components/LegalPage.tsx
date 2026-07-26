import { AlertTriangle } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}

/**
 * Plantilla de página legal: índice navegable + secciones numeradas.
 * Muestra siempre el aviso de contenido provisional hasta que el texto
 * definitivo sea provisto por asesoría legal.
 */
export function LegalPage({ title, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">Última actualización: {lastUpdated}</p>

        <div
          role="note"
          className="mt-5 flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
          <p className="text-sm font-medium text-warning-700">
            <strong>Contenido provisional.</strong> Este texto es una plantilla de referencia y
            será reemplazado por la versión definitiva revisada por asesoría legal antes del
            lanzamiento público.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <nav aria-label="Índice" className="card mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Contenido</p>
          <ol className="mt-2 space-y-1.5 text-sm">
            {sections.map((section, i) => (
              <li key={section.title}>
                <a
                  href={`#seccion-${i + 1}`}
                  className="font-medium text-primary-600 transition-colors hover:text-primary-700"
                >
                  {i + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Reveal>

      <div className="mt-8 space-y-8">
        {sections.map((section, i) => (
          <Reveal key={section.title} delay={Math.min(i * 0.03, 0.15)}>
            <section id={`seccion-${i + 1}`} className="scroll-mt-24">
              <h2 className="text-lg font-bold text-ink">
                {i + 1}. {section.title}
              </h2>
              {section.paragraphs.map((paragraph, j) => (
                <p key={j} className="mt-2 text-sm leading-relaxed text-slate-700">
                  {paragraph}
                </p>
              ))}
            </section>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
