import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { NP_API } from "@/lib/nowpayments";

const HOLD_MINUTES = 60;

const TIER_LABEL: Record<string, string> = {
  kiosk: "Kiosk plot",
  shop: "Shop front plot",
  tower: "Tower plot",
  skyscraper: "Skyscraper plot",
};

function cleanUrl(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

// POST /api/crypto-checkout  { tier, owner_name, website_url, logo_url? }
// Holds the next open plot in that tier for 60 min and returns a NOWPayments
// invoice page where the buyer pays with BTC, ETH, SOL, USDT or USDC.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tier = typeof body.tier === "string" ? body.tier : "";
  const ownerName = typeof body.owner_name === "string" ? body.owner_name.trim().slice(0, 40) : "";
  const websiteUrl = cleanUrl(body.website_url);
  const logoUrl = cleanUrl(body.logo_url);

  if (!TIER_LABEL[tier] || !ownerName || !websiteUrl) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (websiteUrl === undefined || logoUrl === undefined) {
    return NextResponse.json({ error: "Links must start with http:// or https://" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const holdUntil = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000).toISOString();

  // Try the open plots in this tier, left to right, until one can be held.
  const { data: candidates } = await supabase
    .from("plots")
    .select("id")
    .eq("tier", tier)
    .eq("status", "available")
    .or(`reserved_until.is.null,reserved_until.lt.${nowIso}`)
    .order("slot_index", { ascending: true })
    .limit(5);

  let held: { id: string; slot_index: number; price_cents: number } | null = null;
  for (const c of candidates ?? []) {
    // Single conditional UPDATE, so two buyers can never hold the same plot.
    const { data } = await supabase
      .from("plots")
      .update({ reserved_until: holdUntil })
      .eq("id", c.id)
      .eq("status", "available")
      .or(`reserved_until.is.null,reserved_until.lt.${nowIso}`)
      .select("id, slot_index, price_cents")
      .maybeSingle();
    if (data) {
      held = data;
      break;
    }
  }

  if (!held) {
    return NextResponse.json({ error: "No plots left in that tier right now." }, { status: 409 });
  }

  const plotId = held.id;
  const release = () => supabase.from("plots").update({ reserved_until: null }).eq("id", plotId);

  // Price always comes from the database, never from the browser.
  const { data: order, error: orderErr } = await supabase
    .from("crypto_orders")
    .insert({
      plot_id: plotId,
      owner_name: ownerName,
      website_url: websiteUrl,
      logo_url: logoUrl,
      price_cents: held.price_cents,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    await release();
    return NextResponse.json({ error: "Could not create order." }, { status: 500 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  try {
    const r = await fetch(`${NP_API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: held.price_cents / 100,
        price_currency: "usd",
        order_id: order.id,
        order_description: `Plot Avenue ${TIER_LABEL[tier]} #${held.slot_index + 1}`,
        ipn_callback_url: `${siteUrl}/api/nowpayments-webhook`,
        success_url: `${siteUrl}/claim/success`,
        cancel_url: `${siteUrl}/claim`,
      }),
    });
    const invoice = await r.json();
    if (!r.ok || !invoice.invoice_url) throw new Error(invoice.message ?? "no invoice_url");

    await supabase.from("crypto_orders").update({ np_invoice_id: String(invoice.id) }).eq("id", order.id);
    return NextResponse.json({ checkoutUrl: invoice.invoice_url });
  } catch {
    await supabase.from("crypto_orders").update({ status: "failed" }).eq("id", order.id);
    await release();
    return NextResponse.json({ error: "Crypto checkout is unavailable. Please try again." }, { status: 502 });
  }
}
