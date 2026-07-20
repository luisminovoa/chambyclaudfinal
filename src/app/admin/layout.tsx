import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-[70vh] bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl gap-6 px-4 py-4 text-sm font-medium sm:px-6">
          <Link href="/admin" className="text-slate-700 hover:text-primary-700">
            Resumen
          </Link>
          <Link href="/admin/users" className="text-slate-700 hover:text-primary-700">
            Usuarios
          </Link>
          <Link href="/admin/jobs" className="text-slate-700 hover:text-primary-700">
            Trabajos
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
