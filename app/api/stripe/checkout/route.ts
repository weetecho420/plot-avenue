import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { TIER_LABEL, parseClaim, holdPlotInTier, releaseHold } from "@/lib/checkout";
import { isStripeEnabled, stripePost } from "@/lib/stripe";

// Card checkout through Stripe, charged in US dollars. Holds the plot for
// 60 minutes; the Stripe page expires a little sooner, so the hold always
// outlives the checkout. The plot is only claimed once the webhook confirms
// payment.
const HOLD_MINUTES = 60;
const CHECKOUT_MINUTES = 55;

export async function POST(req: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Card payments aren't switched on yet." }, { status: 503 });
  }
  const input = parseClaim(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const held = await holdPlotInTier(input.tier, HOLD_MINUTES, input.slot);
  if (!held) {
    return NextResponse.json(
      { error: input.slot !== null ? "That plot was just taken. Pick another one on the avenue." : "No plots left in that tier right now." },
      { status: 409 }
    );
  }

  const supabase = supabaseAdmin();
  const { data: order, error } = await supabase
    .from("stripe_orders")
    .insert({
      plot_id: held.id,
      owner_name: input.ownerName,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      price_cents: held.price_cents,
    })
    .select("id")
    .single();

  if (error || !order) {
    await releaseHold(held.id);
    return NextResponse.json({ error: "Could not create order." }, { status: 500 });
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const { ok, data } = await stripePost("checkout/sessions", {
    mode: "payment",
    client_reference_id: order.id,
    metadata: { order_id: order.id, plot_slot: held.slot_index + 1 },
    payment_intent_data: { metadata: { order_id: order.id }, description: `Plot Avenue plot #${held.slot_index + 1}` },
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: held.price_cents,
          product_data: {
            name: `${TIER_LABEL[input.tier]} #${held.slot_index + 1} on Plot Avenue`,
            description: `Your logo and link for "${input.ownerName}" on a building on the avenue.`,
          },
        },
      },
    },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
    success_url: `${site}/claim/success?via=card`,
    cancel_url: `${site}/claim${input.slot !== null ? `?slot=${input.slot}` : ""}`,
  });

  if (!ok || !data?.url) {
    await supabase.from("stripe_orders").update({ status: "failed" }).eq("id", order.id);
    await releaseHold(held.id);
    return NextResponse.json({ error: "Could not start card checkout.", detail: data?.error?.message ?? "" }, { status: 502 });
  }

  await supabase.from("stripe_orders").update({ checkout_session_id: data.id }).eq("id", order.id);
  return NextResponse.json({ checkoutUrl: data.url });
}
