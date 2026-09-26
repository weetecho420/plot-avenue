import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

// PayMongo sends: t=<timestamp>,te=<test-sig>,li=<live-sig>
// Verify by HMAC-SHA256("<timestamp>.<raw body>") with the webhook secret,
// then compare against te (test mode) or li (live mode).
function verifySignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const { t, te, li } = parts;
  if (!t) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  return expected === te || expected === li;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paymongo-signature") ?? "";

  const isValid = verifySignature(
    rawBody,
    signatureHeader,
    process.env.PAYMONGO_WEBHOOK_SECRET!
  );

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventType = event.data?.attributes?.type;

  if (eventType !== "checkout_session.payment.paid") {
    // Acknowledge and ignore events we don't care about.
    return NextResponse.json({ ok: true });
  }

  const session = event.data.attributes.data;
  const plotId = session.attributes.reference_number;

  const supabase = supabaseAdmin();

  const { data: plot, error } = await supabase
    .from("plots")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", plotId)
    .eq("status", "pending")
    .select("owner_name, price_cents")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not finalize plot." }, { status: 500 });
  }

  if (plot) {
    await supabase.from("sales_log").insert({
      plot_id: plotId,
      owner_name: plot.owner_name,
      // Log the plot's USD price (the customer paid the peso equivalent),
      // so the sales feed and totals stay in dollars.
      price_cents: plot.price_cents,
    });
  }

  return NextResponse.json({ ok: true });
}
