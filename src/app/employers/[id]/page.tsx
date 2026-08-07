import type { Metadata } from "next";
import { getEmployerPublicProfile } from "@/lib/actions/employers";
import { EmployerPublicProfileView } from "@/components/employers/EmployerPublicProfileView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Perfil del empleador",
};

interface EmployerProfilePageProps {
  params: { id: string };
}

export default async function EmployerProfilePage({ params }: EmployerProfilePageProps) {
  const data = await getEmployerPublicProfile(params.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {!data ? (
        <Reveal>
          <EmptyState
            pose="lost"
            title="No podemos mostrar este perfil"
            description="Este empleador no existe o el enlace ya no es válido."
            actionLabel="Ver trabajos disponibles"
            actionHref="/jobs"
          />
        </Reveal>
      ) : (
        <Reveal>
          <EmployerPublicProfileView data={data} />
        </Reveal>
      )}
    </div>
  );
}
