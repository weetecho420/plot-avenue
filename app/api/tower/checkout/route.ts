import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { usdCentsToPhpCentavos } from "@/lib/fx";
import { isStripeEnabled, stripePost } from "@/lib/stripe";
import { parseTower, usd } from "@/lib/tower";

// POST /api/tower/checkout { via: "card" | "gcash", owner_name, website_url, logo_url?, message? }
// The price always comes from the database ($5, then +$1 per takeover), never from the browser.
// The tower only changes once the payment webhook confirms the money arrived.
const CHECKOUT_MINUTES = 30;

export async function POST(req: Request) {
  const input = parseTower(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  if (input.via === "card" && !isStripeEnabled()) {
    return NextResponse.json({ error: "Card payments aren't switched on yet. Use GCash / QR Ph." }, { status: 503 });
  }

  const supabase = supabaseAdmin();
  const { data: price, error: priceErr } = await supabase.rpc("tower_next_price_cents");
  if (priceErr || typeof price !== "number") return NextResponse.json({ error: "The tower is resting. Try again soon." }, { status: 503 });

  let amountPhp: number | null = null;
  if (input.via === "gcash") {
    try {
      amountPhp = await usdCentsToPhpCentavos(price);
    } catch {
      return NextResponse.json({ error: "Payment setup failed. Please try again." }, { status: 502 });
    }
  }

  const { data: order, error } = await supabase
    .from("tower_orders")
    .insert({
      owner_name: input.ownerName,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      message: input.message,
      price_cents: price,
      via: input.via,
      amount_php_centavos: amountPhp,
    })
    .select("id")
    .single();
  if (error || !order) return NextResponse.json({ error: "Could not create order." }, { status: 500 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const name = `Neon Tower takeover on Plot Avenue (${usd(price)})`;

  if (input.via === "card") {
    const { ok, data } = await stripePost("checkout/sessions", {
      mode: "payment",
      client_reference_id: order.id,
      metadata: { order_id: order.id, kind: "tower" },
      payment_intent_data: { metadata: { order_id: order.id, kind: "tower" }, description: name },
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: price,
            product_data: { name, description: `"${input.ownerName}" goes up on the Neon Tower until someone takes it over.` },
          },
        },
      },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
      success_url: `${site}/tower?done=1`,
      cancel_url: `${site}/tower`,
    });
    if (!ok || !data?.url) {
      await supabase.from("tower_orders").update({ status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "Could not start card checkout." }, { status: 502 });
    }
    await supabase.from("tower_orders").update({ session_id: data.id }).eq("id", order.id);
    return NextResponse.json({ checkoutUrl: data.url });
  }

  try {
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
            description: name,
            line_items: [{ name: "Neon Tower takeover", amount: amountPhp, currency: "PHP", quantity: 1 }],
            payment_method_types: ["gcash", "card", "qrph"],
            success_url: `${site}/tower?done=1`,
            cancel_url: `${site}/tower`,
          },
        },
      }),
    });
    const session = await r.json();
    const checkoutUrl = session?.data?.attributes?.checkout_url;
    if (!r.ok || !checkoutUrl) throw new Error("no checkout_url");
    await supabase.from("tower_orders").update({ session_id: session.data.id }).eq("id", order.id);
    return NextResponse.json({ checkoutUrl });
  } catch {
    await supabase.from("tower_orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Payment setup failed. Please try again." }, { status: 502 });
  }
}
