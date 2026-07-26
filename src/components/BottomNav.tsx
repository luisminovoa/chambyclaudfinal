import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { BottomNavClient } from "@/components/BottomNavClient";

export async function BottomNav() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <BottomNavClient
      isLoggedIn={Boolean(user)}
      role={profile?.role ?? null}
    />
  );
}
