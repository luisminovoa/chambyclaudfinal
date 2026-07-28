import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { ReportErrorButton } from "./ReportErrorButton";

export async function ReportErrorButtonWrapper() {
  const { user } = await getCurrentUserAndProfile();
  return <ReportErrorButton userId={user?.id ?? null} />;
}
