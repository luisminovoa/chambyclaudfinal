import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { NewJobForm } from "@/components/NewJobForm";

export default async function NewJobPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login?next=/jobs/new");
  if (profile && profile.role !== "employer" && profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Publicar un trabajo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Completa los detalles y encuentra al trabajador ideal.
        </p>
        <div className="mt-6">
          <NewJobForm />
        </div>
      </div>
    </div>
  );
}
