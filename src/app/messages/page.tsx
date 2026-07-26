import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Mensajes — Chamby",
};

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Mensajes</h1>
        <p className="mt-1 text-ink-muted">Conversa con empleadores y trabajadores.</p>
      </Reveal>
      <div className="mt-8">
        <Reveal delay={0.05}>
          <EmptyState
            icon={MessageCircle}
            title="Muy pronto"
            description="La mensajería directa entre trabajadores y empleadores llegará en la próxima versión. Mientras tanto, coordina desde los detalles de cada trabajo."
            actionLabel="Explorar trabajos"
            actionHref="/jobs"
          />
        </Reveal>
      </div>
    </div>
  );
}
