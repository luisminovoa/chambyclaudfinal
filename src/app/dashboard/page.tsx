import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";

export default async function DashboardIndexPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");

  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "employer") redirect("/dashboard/employer");
  redirect("/dashboard/worker");
}
