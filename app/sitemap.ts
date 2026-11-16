import type { MetadataRoute } from "next";
import { supabasePublic } from "@/lib/supabase";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://plot-avenue.vercel.app").replace(/\/$/, "");
  const { data } = await supabasePublic.from("plots").select("slot_index, claimed_at").order("slot_index");
  return [
    { url: `${site}/`, changeFrequency: "daily", priority: 1 },
    { url: `${site}/tower`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${site}/claim`, changeFrequency: "weekly", priority: 0.6 },
    ...(data ?? []).map((p) => ({
      url: `${site}/plot/${p.slot_index + 1}`,
      lastModified: p.claimed_at ? new Date(p.claimed_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
