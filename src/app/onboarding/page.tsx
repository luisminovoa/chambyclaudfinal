import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { RoleOnboardingForm } from "@/components/onboarding/RoleOnboardingForm";
import { Reveal } from "@/components/ui/Reveal";
import { LogoCompacto } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Bienvenido",
  description: "Cuéntanos qué quieres hacer en Chamby.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

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
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
              {profile?.full_name ? `Hola, ${profile.full_name.split(" ")[0]} 👋` : "¡Bienvenido!"}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">¿Qué quieres hacer en Chamby?</p>
            <div className="mt-6">
              <RoleOnboardingForm next={searchParams.next} initialCity={profile?.city ?? null} />
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
