import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chambyclaudfinal.netlify.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/jobs`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/register`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createClient();
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, updated_at")
      .eq("status", "abierto")
      .order("created_at", { ascending: false })
      .limit(500);

    const jobRoutes: MetadataRoute.Sitemap = ((jobs as { id: string; updated_at: string }[]) ?? []).map(
      (job) => ({
        url: `${SITE_URL}/jobs/${job.id}`,
        lastModified: new Date(job.updated_at),
        changeFrequency: "daily",
        priority: 0.8,
      })
    );

    return [...staticRoutes, ...jobRoutes];
  } catch {
    // Si la base no responde, el sitemap estático sigue siendo válido
    return staticRoutes;
  }
}
