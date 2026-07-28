import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { getNotifications, getUnreadCount, markAllNotificationsRead } from "@/lib/actions/notifications";
import { NotificationsPageClient } from "./NotificationsPageClient";

export const metadata: Metadata = {
  title: "Notificaciones | Chamby",
};

export default async function NotificationsPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/notifications");

  const [{ notifications, hasMore }, unreadCount] = await Promise.all([
    getNotifications(),
    getUnreadCount(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <NotificationsPageClient
        userId={user.id}
        initialNotifications={notifications}
        initialHasMore={hasMore}
        initialUnreadCount={unreadCount}
        markAllAction={markAllNotificationsRead}
      />
    </main>
  );
}
