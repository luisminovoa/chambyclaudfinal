import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getMessagesUnreadCount } from "@/lib/actions/notifications";
import { BottomNavClient } from "@/components/BottomNavClient";

export async function BottomNav() {
  const { user, profile, userRoles } = await getCurrentUserAndProfile();
  const messagesUnreadCount = user ? await getMessagesUnreadCount() : 0;

  return (
    <BottomNavClient
      isLoggedIn={Boolean(user)}
      role={profile?.role ?? null}
      hasEmployerRole={userRoles.includes("employer")}
      messagesUnreadCount={messagesUnreadCount}
    />
  );
}
