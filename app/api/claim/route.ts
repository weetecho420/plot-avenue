import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { usdCentsToPhpCentavos } from "@/lib/fx";

const TIER_LABEL: Record<string, string> = {
  kiosk: "Kiosk plot",
  shop: "Shop front plot",
  tower: "Tower plot",
  skyscraper: "Skyscraper plot",
};

export async function POST(req: Request) {
  const body = await req.json();
  const { tier, owner_name, website_url, logo_url } = body;

  if (!tier || !owner_name || !website_url) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: candidate, error: findError } = await supabase
    .from("plots")
    .select("id, price_cents")
    .eq("tier", tier)
    .eq("status", "available")
    // Skip plots someone is currently paying for with crypto.
    .or(`reserved_until.is.null,reserved_until.lt.${new Date().toISOString()}`)
    .order("slot_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError || !candidate) {
    return NextResponse.json({ error: "No plots left in that tier." }, { status: 409 });
  }

  // Reserve it so nobody else can grab the same plot while this buyer pays.
  const { error: updateError } = await supabase
    .from("plots")
    .update({ status: "pending", owner_name, website_url, logo_url })
    .eq("id", candidate.id)
    .eq("status", "available");

  if (updateError) {
    return NextResponse.json({ error: "Could not reserve that plot." }, { status: 500 });
  }

  // Create the PayMongo Checkout Session. reference_number carries the
  // plot id through to the webhook so we know what to mark "claimed".
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  // Plot prices are in US cents; PayMongo charges pesos, so convert.
  const amountPhpCentavos = await usdCentsToPhpCentavos(candidate.price_cents);
  const checkoutRes = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString("base64"),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          reference_number: candidate.id,
          line_items: [
            {
              name: TIER_LABEL[tier] ?? "Plot",
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

  if (!checkoutRes.ok) {
    // Release the plot if PayMongo rejects the session, so it isn't stuck pending.
    await supabase.from("plots").update({ status: "available" }).eq("id", candidate.id);
    const errText = await checkoutRes.text();
    return NextResponse.json({ error: "Payment setup failed.", detail: errText }, { status: 500 });
  }

  const checkoutData = await checkoutRes.json();
  const checkoutUrl = checkoutData.data.attributes.checkout_url;

  return NextResponse.json({ checkoutUrl });
}
