import { supabasePublic } from "@/lib/supabase";
import { cleanUrl } from "@/lib/checkout";

// The Neon Tower: one billboard, anyone can take it over, +$1 every time.
export const TOWER_START_CENTS = 500;
export const TOWER_STEP_CENTS = 100;

export type TowerState = {
  owner_name: string | null;
  website_url: string | null;
  logo_url: string | null;
  message: string | null;
  price_cents: number;
  takeovers: number;
  taken_at: string | null;
};

export const nextPriceCents = (takeovers: number) => TOWER_START_CENTS + takeovers * TOWER_STEP_CENTS;

export async function getTower() {
  const [{ data: state }, { data: history }] = await Promise.all([
    supabasePublic.from("tower_state").select("*").eq("id", 1).maybeSingle(),
    supabasePublic
      .from("tower_history")
      .select("takeover_no, owner_name, website_url, logo_url, message, price_cents, created_at")
      .order("takeover_no", { ascending: false })
      .limit(50),
  ]);
  const s = (state ?? { takeovers: 0, price_cents: 0 }) as TowerState;
  return { state: s, history: history ?? [], next_price_cents: nextPriceCents(s.takeovers ?? 0) };
}

export type TowerInput = { ownerName: string; websiteUrl: string; logoUrl: string | null; message: string | null; via: "card" | "gcash" };

export function parseTower(body: any): TowerInput | { error: string } {
  const ownerName = typeof body?.owner_name === "string" ? body.owner_name.trim().slice(0, 40) : "";
  const message = typeof body?.message === "string" ? body.message.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const websiteUrl = cleanUrl(body?.website_url);
  const logoUrl = cleanUrl(body?.logo_url);
  const via = body?.via === "card" ? "card" : body?.via === "gcash" ? "gcash" : null;
  if (!via) return { error: "Pick a way to pay." };
  if (!ownerName || !websiteUrl) return { error: "Add your name and website." };
  if (websiteUrl === undefined || logoUrl === undefined) return { error: "Links must start with http:// or https://" };
  return { ownerName, websiteUrl, logoUrl, message: message || null, via };
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
