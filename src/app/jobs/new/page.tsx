import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { JobWizardForm } from "@/components/JobWizardForm";
import { Reveal } from "@/components/ui/Reveal";

export default async function NewJobPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login?next=/jobs/new");
  // Require employer mode to be active (not just role ownership)
  if (!profile || (profile.role !== "employer" && profile.role !== "admin")) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Publicar una chamba
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Completa los detalles paso a paso y encuentra al trabajador ideal.
          </p>
          <div className="mt-6">
            <JobWizardForm />
          </div>
        </div>
      </Reveal>
    </div>
  );
}
