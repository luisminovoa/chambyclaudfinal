"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { BETA_CONFIG } from "@/lib/beta-config";
import type { ActionResult } from "@/lib/actions/auth";
import type { BugReport, BetaStats } from "@/lib/types";

interface BugReportInput {
  route: string;
  description: string;
  browser: string | null;
  os: string | null;
  resolution: string | null;
}

export async function submitBugReport(input: BugReportInput): Promise<ActionResult> {
  if (!input.description.trim()) return { error: "La descripción no puede estar vacía." };
  if (input.description.length > 2000) return { error: "Descripción demasiado larga." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("bug_reports").insert({
    user_id: user?.id ?? null,
    route: input.route.slice(0, 500),
    description: input.description.trim(),
    browser: input.browser?.slice(0, 300) ?? null,
    os: input.os?.slice(0, 100) ?? null,
    resolution: input.resolution?.slice(0, 50) ?? null,
    version: BETA_CONFIG.version,
  });

  if (error) return { error: "No se pudo enviar el reporte. Intenta de nuevo." };
  return { success: true };
}

export async function getBetaStats(): Promise<BetaStats> {
  const admin = createAdminClient();

  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: totalJobs },
    { count: completedJobs },
    { count: totalConversations },
    { count: totalMessages },
    { count: totalNotifications },
    { count: bugReports },
    { data: ratingsData },
    { data: hireData },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("jobs").select("*", { count: "exact", head: true }),
    admin.from("jobs").select("*", { count: "exact", head: true }).eq("status", "completado"),
    admin.from("conversations").select("*", { count: "exact", head: true }),
    admin.from("messages").select("*", { count: "exact", head: true }),
    admin.from("notifications").select("*", { count: "exact", head: true }),
    admin.from("bug_reports").select("*", { count: "exact", head: true }),
    admin.from("ratings").select("score"),
    admin.from("jobs").select("created_at, hired_at").not("hired_at", "is", null),
  ]);

  const avgRating =
    ratingsData && ratingsData.length > 0
      ? (ratingsData as { score: number }[]).reduce((s, r) => s + r.score, 0) / ratingsData.length
      : null;

  const avgHireMinutes =
    hireData && hireData.length > 0
      ? (hireData as { created_at: string; hired_at: string }[]).reduce((s, j) => {
          return s + (new Date(j.hired_at).getTime() - new Date(j.created_at).getTime()) / 60000;
        }, 0) / hireData.length
      : null;

  return {
    totalUsers: totalUsers ?? 0,
    activeUsers: activeUsers ?? 0,
    totalJobs: totalJobs ?? 0,
    completedJobs: completedJobs ?? 0,
    totalConversations: totalConversations ?? 0,
    totalMessages: totalMessages ?? 0,
    totalNotifications: totalNotifications ?? 0,
    bugReports: bugReports ?? 0,
    avgRating,
    avgHireMinutes,
  };
}

export async function getBugReports(limit = 20): Promise<BugReport[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as BugReport[]) ?? [];
}
