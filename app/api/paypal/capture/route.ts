import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypal, valueToCents } from "@/lib/paypal";
import { releaseHold } from "@/lib/checkout";

// POST /api/paypal/capture  { orderID }
// Takes the money, checks the amount, then claims the plot.
// If the plot was sold another way in the meantime, the buyer is refunded automatically.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const paypalOrderId = typeof body.orderID === "string" ? body.orderID.slice(0, 64) : "";
  if (!paypalOrderId) return NextResponse.json({ error: "Missing order." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: order } = await supabase
    .from("paypal_orders")
    .select("id, plot_id, price_cents, status")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status === "paid") return NextResponse.json({ result: "ok" });
  if (order.status !== "pending") {
    return NextResponse.json({ error: "This order can no longer be paid." }, { status: 409 });
  }

  // 1) Take the money. Same request id on retries = no double charge.
  const cap = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    requestId: `capture-${order.id}`,
  });

  if (!cap.ok) {
    if (cap.data?.details?.[0]?.issue === "INSTRUMENT_DECLINED") {
      // Card declined: let the buyer pick another card in the PayPal popup.
      return NextResponse.json({ error: "declined", retry: true }, { status: 402 });
    }
    return NextResponse.json({ error: "PayPal could not complete the payment." }, { status: 502 });
  }

  const unit = cap.data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const payerEmail: string | null = cap.data.payer?.email_address ?? null;
  if (!capture) return NextResponse.json({ error: "PayPal returned no payment." }, { status: 502 });

  // 2) Safety checks: right order, right currency, right amount.
  const amountOk =
    capture.amount?.currency_code === "USD" && valueToCents(capture.amount?.value) === order.price_cents;
  const idOk = (capture.custom_id ?? unit.custom_id) === order.id;

  if (!amountOk || !idOk) {
    await supabase
      .from("paypal_orders")
      .update({ status: "needs_refund", paypal_capture_id: capture.id, payer_email: payerEmail })
      .eq("id", order.id);
    return NextResponse.json({ error: "Payment did not match the order. We will refund you." }, { status: 400 });
  }

  if (capture.status === "PENDING") {
    // Rare (e.g. eCheck or PayPal review). Don't claim yet; check the PayPal dashboard.
    await supabase
      .from("paypal_orders")
      .update({ status: "pending_review", paypal_capture_id: capture.id, payer_email: payerEmail })
      .eq("id", order.id);
    return NextResponse.json({ result: "pending" }, { status: 202 });
  }

  if (capture.status !== "COMPLETED") {
    await supabase.from("paypal_orders").update({ status: "failed" }).eq("id", order.id);
    await releaseHold(order.plot_id);
    return NextResponse.json({ error: "Payment was not completed." }, { status: 402 });
  }

  // 3) Claim the plot + log the sale in one database step.
  const { data: result, error } = await supabase.rpc("complete_paypal_order", {
    p_order_id: order.id,
    p_capture_id: capture.id,
    p_payer_email: payerEmail,
  });
  if (error) return NextResponse.json({ error: "Paid, but saving failed. Please contact us." }, { status: 500 });

  if (result === "plot_taken") {
    // Someone else bought it first. Give the money back straight away.
    const refund = await paypal(`/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`, {
      requestId: `refund-${order.id}`,
      body: {},
    });
    if (refund.ok) {
      await supabase.from("paypal_orders").update({ status: "refunded" }).eq("id", order.id);
      return NextResponse.json({ error: "Sorry, that plot was just taken. You have been fully refunded." }, { status: 409 });
    }
    return NextResponse.json({ error: "Sorry, that plot was just taken. We will refund you shortly." }, { status: 409 });
  }

  return NextResponse.json({ result: "ok" });
}
