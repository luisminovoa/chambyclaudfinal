"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { Notification, NotificationPreferences, NotificationType } from "@/lib/types";

const NOTIFICATIONS_PER_PAGE = 20;

export async function getNotifications(
  cursor?: string,
  filter?: "all" | "unread" | "jobs" | "messages"
): Promise<{ notifications: Notification[]; hasMore: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [], hasMore: false };

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_PER_PAGE + 1);

  if (cursor) query = query.lt("created_at", cursor);

  if (filter === "unread") {
    query = query.eq("is_read", false);
  } else if (filter === "jobs") {
    query = query.in("type", [
      "new_application",
      "application_accepted",
      "application_rejected",
      "job_started",
      "job_completed",
    ] as NotificationType[]);
  } else if (filter === "messages") {
    query = query.eq("type", "new_message" as NotificationType);
  }

  const { data } = await query;
  const rows = (data as unknown as Notification[]) ?? [];
  const hasMore = rows.length > NOTIFICATIONS_PER_PAGE;

  return { notifications: rows.slice(0, NOTIFICATIONS_PER_PAGE), hasMore };
}

export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo marcar como leída." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) return { error: "No se pudieron marcar como leídas." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (data as unknown as NotificationPreferences | null) ?? null;
}

export async function updateNotificationPreferences(
  prefs: Partial<Omit<NotificationPreferences, "user_id" | "updated_at">>
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase.from("notification_preferences").upsert(
    { user_id: user.id, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: "No se pudieron guardar las preferencias." };
  return { success: true };
}

export async function getMessagesUnreadCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: convRows } = await supabase
    .from("conversations")
    .select("id")
    .or(`employer_id.eq.${user.id},worker_id.eq.${user.id}`);

  if (!convRows || convRows.length === 0) return 0;

  const convIds = (convRows as { id: string }[]).map((c) => c.id);

  const { data: cursorRows } = await supabase
    .from("conversation_read_cursors")
    .select("conversation_id, last_read_at")
    .eq("profile_id", user.id)
    .in("conversation_id", convIds);

  const cursorMap = new Map(
    ((cursorRows as { conversation_id: string; last_read_at: string }[] | null) ?? []).map((c) => [
      c.conversation_id,
      c.last_read_at,
    ])
  );

  let total = 0;
  for (const conv of convIds) {
    const cursor = cursorMap.get(conv);
    let query = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conv)
      .neq("sender_id", user.id);

    if (cursor) {
      query = query.gt("created_at", cursor);
    } else {
      query = query.is("read_at", null);
    }

    const { count } = await query;
    total += count ?? 0;
  }

  return total;
}
