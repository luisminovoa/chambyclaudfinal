import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { AdminTabs } from "@/components/AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-[70vh]">
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AdminTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
