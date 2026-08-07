import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { Reveal } from "@/components/ui/Reveal";
import { LogoCompacto } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description: "Establece una nueva contraseña para tu cuenta de Chamby.",
};

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
            {user ? (
              <>
                <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
                  Elige tu nueva contraseña
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Usa al menos 8 caracteres. Al guardarla, entrarás directo a tu cuenta.
                </p>
                <div className="mt-6">
                  <ResetPasswordForm />
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
                  Este enlace ya no es válido
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  El enlace expiró o ya fue usado. Solicita uno nuevo para restablecer tu
                  contraseña.
                </p>
                <div className="mt-6">
                  <Link href="/forgot-password" className="btn-primary w-full">
                    <ArrowLeft className="h-4 w-4" />
                    Solicitar un nuevo enlace
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
