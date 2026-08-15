import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getWorkerPublicProfile } from "@/lib/actions/workers";
import { WorkerPublicProfileView } from "@/components/workers/WorkerPublicProfileView";
import { WorkerProfileActions } from "@/components/workers/WorkerProfileActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Perfil del trabajador",
};

interface WorkerProfilePageProps {
  params: { workerId: string };
  searchParams: { job?: string };
}

export default async function WorkerProfilePage({ params, searchParams }: WorkerProfilePageProps) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect(`/login?next=/workers/${params.workerId}`);

  const data = await getWorkerPublicProfile(params.workerId, searchParams.job);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {!data ? (
        <Reveal>
          <EmptyState
            pose="lost"
            title="No podemos mostrar este perfil"
            description="El trabajador no existe o todavía no tienes acceso a su perfil — solo puedes ver el de trabajadores que postularon a tus publicaciones."
            actionLabel="Volver al panel"
            actionHref="/dashboard"
          />
        </Reveal>
      ) : (
        <div className="space-y-6">
          {data.jobId && (
            <Reveal>
              <WorkerProfileActions
                jobId={data.jobId}
                workerId={data.profile.id}
                workerName={data.profile.full_name}
                application={data.application}
                conversationId={data.conversationId}
                canManage={data.viewerIsEmployer}
              />
            </Reveal>
          )}
          <Reveal delay={0.05}>
            <WorkerPublicProfileView data={data} viewerId={user.id} />
          </Reveal>
        </div>
      )}
    </div>
  );
}
