import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypal, centsToValue } from "@/lib/paypal";
import { TIER_LABEL, parseClaim, holdPlotInTier, releaseHold } from "@/lib/checkout";

const HOLD_MINUTES = 30;

// POST /api/paypal/create  { tier, owner_name, website_url, logo_url? }
// Holds the next open plot in that tier and creates a PayPal order. Returns { id }.
export async function POST(req: Request) {
  const input = parseClaim(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const held = await holdPlotInTier(input.tier, HOLD_MINUTES);
  if (!held) {
    return NextResponse.json({ error: "No plots left in that tier right now." }, { status: 409 });
  }

  const supabase = supabaseAdmin();
  const { data: order, error: orderErr } = await supabase
    .from("paypal_orders")
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

  try {
    const pp = await paypal("/v2/checkout/orders", {
      requestId: `create-${order.id}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: order.id,
            custom_id: order.id,
            description: `Plot Avenue ${TIER_LABEL[input.tier]} #${held.slot_index + 1}`,
            amount: { currency_code: "USD", value: centsToValue(held.price_cents) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "Plot Avenue",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
            },
          },
        },
      },
    });
    if (!pp.ok || !pp.data.id) throw new Error("create failed");

    await supabase.from("paypal_orders").update({ paypal_order_id: pp.data.id }).eq("id", order.id);
    return NextResponse.json({ id: pp.data.id });
  } catch {
    await supabase.from("paypal_orders").update({ status: "failed" }).eq("id", order.id);
    await releaseHold(held.id);
    return NextResponse.json({ error: "PayPal is unavailable right now. Please try again." }, { status: 502 });
  }
}
