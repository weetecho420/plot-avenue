import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { releaseHold } from "@/lib/checkout";
import { verifyStripeSignature } from "@/lib/stripe";

// POST /api/stripe/webhook
// Listen for: checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.expired.
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const session = event?.data?.object;
  const orderId = String(session?.client_reference_id ?? session?.metadata?.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ ok: true });

  const supabase = supabaseAdmin();
  const { data: order } = await supabase
    .from("stripe_orders")
    .select("id, plot_id, price_cents, status")
    .eq("id", orderId)
    .maybeSingle();
  // Unknown order: say OK so Stripe stops retrying, but do nothing.
  if (!order || order.status === "paid") return NextResponse.json({ ok: true });

  // Buyer walked away: put the plot back on sale straight away.
  if (event.type === "checkout.session.expired") {
    if (order.status === "pending") {
      await supabase.from("stripe_orders").update({ status: "expired" }).eq("id", order.id).eq("status", "pending");
      await releaseHold(order.plot_id);
    }
    return NextResponse.json({ ok: true });
  }

  const paidEvent =
    event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  if (!paidEvent || session?.payment_status !== "paid") return NextResponse.json({ ok: true });

  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const email = session.customer_details?.email ?? null;

  // Safety check: the amount paid must match the plot price.
  if (session.currency !== "usd" || Number(session.amount_total) !== order.price_cents) {
    await supabase
      .from("stripe_orders")
      .update({ status: "needs_refund", checkout_session_id: session.id, payment_intent_id: paymentIntent, customer_email: email })
      .eq("id", order.id);
    return NextResponse.json({ ok: true });
  }

  // Claim the plot + log the sale in one step. If someone else got the plot
  // first, the order is marked "needs_refund" — refund it from the Stripe dashboard.
  const { error } = await supabase.rpc("complete_stripe_order", {
    p_order_id: order.id,
    p_session_id: session.id,
    p_payment_intent: paymentIntent,
    p_email: email,
  });
  // On a database error, answer 500 so Stripe retries later.
  if (error) return NextResponse.json({ error: "Could not finalize plot." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
