import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { NP_API } from "@/lib/nowpayments";
import { TIER_LABEL, parseClaim, holdPlotInTier, releaseHold } from "@/lib/checkout";

const HOLD_MINUTES = 60;

// POST /api/crypto-checkout  { tier, owner_name, website_url, logo_url? }
// Holds the next open plot in that tier for 60 min and returns a NOWPayments
// invoice page where the buyer pays with BTC, ETH, SOL, USDT or USDC.
export async function POST(req: Request) {
  const input = parseClaim(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const held = await holdPlotInTier(input.tier, HOLD_MINUTES);
  if (!held) {
    return NextResponse.json({ error: "No plots left in that tier right now." }, { status: 409 });
  }

  const supabase = supabaseAdmin();

  // Price always comes from the database, never from the browser.
  const { data: order, error: orderErr } = await supabase
    .from("crypto_orders")
    .insert({
      plot_id: held.id,
      owner_name: input.ownerName,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      price_cents: held.price_cents,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    await releaseHold(held.id);
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
        order_description: `Plot Avenue ${TIER_LABEL[input.tier]} #${held.slot_index + 1}`,
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
    await releaseHold(held.id);
    return NextResponse.json({ error: "Crypto checkout is unavailable. Please try again." }, { status: 502 });
  }
}
