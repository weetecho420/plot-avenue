import { supabaseAdmin } from "@/lib/supabase";

// Shared by the crypto and PayPal checkouts. Server-only.

export const TIER_LABEL: Record<string, string> = {
  kiosk: "Kiosk plot",
  shop: "Shop front plot",
  tower: "Tower plot",
  skyscraper: "Skyscraper plot",
};

// null = empty (allowed), undefined = present but not a valid http(s) link.
export function cleanUrl(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

export type ClaimInput = { tier: string; ownerName: string; websiteUrl: string; logoUrl: string | null };

export function parseClaim(body: any): ClaimInput | { error: string } {
  const tier = typeof body?.tier === "string" ? body.tier : "";
  const ownerName = typeof body?.owner_name === "string" ? body.owner_name.trim().slice(0, 40) : "";
  const websiteUrl = cleanUrl(body?.website_url);
  const logoUrl = cleanUrl(body?.logo_url);
  if (!TIER_LABEL[tier] || !ownerName || !websiteUrl) return { error: "Missing required fields." };
  if (websiteUrl === undefined || logoUrl === undefined) return { error: "Links must start with http:// or https://" };
  return { tier, ownerName, websiteUrl, logoUrl };
}

// Hold the next open plot in a tier until `minutes` from now.
// Each attempt is one conditional UPDATE, so two buyers can never hold the same plot.
export async function holdPlotInTier(tier: string, minutes: number) {
  const supabase = supabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const holdUntil = new Date(now.getTime() + minutes * 60 * 1000).toISOString();

  const { data: candidates } = await supabase
    .from("plots")
    .select("id")
    .eq("tier", tier)
    .eq("status", "available")
    .or(`reserved_until.is.null,reserved_until.lt.${nowIso}`)
    .order("slot_index", { ascending: true })
    .limit(5);

  for (const c of candidates ?? []) {
    const { data } = await supabase
      .from("plots")
      .update({ reserved_until: holdUntil })
      .eq("id", c.id)
      .eq("status", "available")
      .or(`reserved_until.is.null,reserved_until.lt.${nowIso}`)
      .select("id, slot_index, price_cents")
      .maybeSingle();
    if (data) return data as { id: string; slot_index: number; price_cents: number };
  }
  return null;
}

export async function releaseHold(plotId: string) {
  await supabaseAdmin().from("plots").update({ reserved_until: null }).eq("id", plotId).eq("status", "available");
}
