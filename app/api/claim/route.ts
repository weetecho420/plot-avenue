import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { usdCentsToPhpCentavos } from "@/lib/fx";
import { TIER_LABEL, parseClaim, holdPlotInTier, releaseHold } from "@/lib/checkout";

const HOLD_MINUTES = 60;

// POST /api/claim  { tier, owner_name, website_url, logo_url? }
// PayMongo checkout (GCash, card, QR Ph). Holds the next open plot in that
// tier for 60 min — if the buyer walks away, the hold expires on its own and
// the plot goes back on sale. The plot is only claimed once the webhook
// confirms payment.
export async function POST(req: Request) {
  const input = parseClaim(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const held = await holdPlotInTier(input.tier, HOLD_MINUTES, input.slot);
  if (!held) {
    return NextResponse.json({ error: input.slot !== null ? "That plot was just taken. Pick another one on the avenue." : "No plots left in that tier right now." }, { status: 409 });
  }

  const supabase = supabaseAdmin();

  let amountPhpCentavos: number;
  try {
    // Plot prices are in US cents; PayMongo charges pesos, so convert.
    amountPhpCentavos = await usdCentsToPhpCentavos(held.price_cents);
  } catch {
    await releaseHold(held.id);
    return NextResponse.json({ error: "Payment setup failed. Please try again." }, { status: 502 });
  }

  // Price always comes from the database, never from the browser.
  const { data: order, error: orderErr } = await supabase
    .from("paymongo_orders")
    .insert({
      plot_id: held.id,
      owner_name: input.ownerName,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      price_cents: held.price_cents,
      amount_php_centavos: amountPhpCentavos,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    await releaseHold(held.id);
    return NextResponse.json({ error: "Could not create order." }, { status: 500 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  try {
    // reference_number carries our order id through to the webhook.
    const r = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString("base64"),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            reference_number: order.id,
            description: `Plot Avenue ${TIER_LABEL[input.tier]} #${held.slot_index + 1}`,
            line_items: [
              {
                name: TIER_LABEL[input.tier],
                amount: amountPhpCentavos,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash", "card", "qrph"],
            success_url: `${siteUrl}/claim/success`,
            cancel_url: `${siteUrl}/claim`,
          },
        },
      }),
    });
    const session = await r.json();
    const checkoutUrl = session?.data?.attributes?.checkout_url;
    if (!r.ok || !checkoutUrl) throw new Error("no checkout_url");

    await supabase.from("paymongo_orders").update({ checkout_session_id: session.data.id }).eq("id", order.id);
    return NextResponse.json({ checkoutUrl });
  } catch {
    await supabase.from("paymongo_orders").update({ status: "failed" }).eq("id", order.id);
    await releaseHold(held.id);
    return NextResponse.json({ error: "Payment setup failed. Please try again." }, { status: 502 });
  }
}
