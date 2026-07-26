import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";
import { Reveal } from "@/components/ui/Reveal";
import { LogoCompacto } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Únete gratis a Chamby como trabajador o empleador en menos de un minuto.",
};

export default function RegisterPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div
        className="absolute -top-10 left-1/2 h-64 w-[min(500px,100vw)] -translate-x-1/2 rounded-full bg-primary-200/30 blur-3xl"
        aria-hidden
      />
      <Reveal>
        <div className="card relative overflow-hidden">
          <div className="h-1.5 bg-brand-gradient" aria-hidden />
          <div className="p-8">
            <LogoCompacto className="h-12 w-12" />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">Crea tu cuenta</h1>
            <p className="mt-1 text-sm text-ink-muted">Únete a Chamby en menos de un minuto</p>
            <div className="mt-6">
              <RegisterForm next={searchParams.next} />
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
