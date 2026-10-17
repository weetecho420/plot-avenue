import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

// POST /api/webhook  (PayMongo)
// PayMongo sends: Paymongo-Signature: t=<timestamp>,te=<test-sig>,li=<live-sig>
// Verify by HMAC-SHA256("<timestamp>.<raw body>") with the webhook secret,
// then compare against te (test mode) or li (live mode).
function verifySignature(rawBody: string, signatureHeader: string, secret: string | undefined) {
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const { t, te, li } = parts;
  if (!t) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const same = (sig?: string) =>
    !!sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return same(te) || same(li);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get("paymongo-signature") ?? "", process.env.PAYMONGO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.data?.attributes?.type !== "checkout_session.payment.paid") {
    // Acknowledge and ignore events we don't care about.
    return NextResponse.json({ ok: true });
  }

  const session = event.data.attributes.data;
  const orderId = String(session?.attributes?.reference_number ?? "");
  const payment = session?.attributes?.payments?.[0];
  const paymentId: string | null = payment?.id ?? null;
  const paidAmount = Number(payment?.attributes?.amount);

  const supabase = supabaseAdmin();
  const { data: order } = await supabase
    .from("paymongo_orders")
    .select("id, amount_php_centavos, status")
    .eq("id", orderId)
    .maybeSingle();

  // Unknown order: say OK so PayMongo stops retrying, but do nothing.
  if (!order) return NextResponse.json({ ok: true });
  if (order.status === "paid") return NextResponse.json({ ok: true });

  // Safety check: the amount paid must match what we charged.
  if (paidAmount !== order.amount_php_centavos) {
    await supabase
      .from("paymongo_orders")
      .update({ status: "needs_refund", payment_id: paymentId, checkout_session_id: session?.id ?? null })
      .eq("id", order.id);
    return NextResponse.json({ ok: true });
  }

  // Claim the plot + log the sale in one database step. If the 60-minute hold
  // ran out and someone else bought the plot first, the order is marked
  // "needs_refund" — refund it from the PayMongo dashboard.
  const { error } = await supabase.rpc("complete_paymongo_order", {
    p_order_id: order.id,
    p_session_id: session?.id ?? null,
    p_payment_id: paymentId,
  });
  // On a database error, answer 500 so PayMongo retries later.
  if (error) return NextResponse.json({ error: "Could not finalize plot." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
