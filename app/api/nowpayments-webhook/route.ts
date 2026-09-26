import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidIpnSignature } from "@/lib/nowpayments";

// POST /api/nowpayments-webhook  (NOWPayments "IPN" callback)
// Verifies the signature, then claims the plot once the payment is finished.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!isValidIpnSignature(body, req.headers.get("x-nowpayments-sig"), process.env.NOWPAYMENTS_IPN_SECRET)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: order } = await supabase
    .from("crypto_orders")
    .select("id, plot_id, price_cents, status")
    .eq("id", String(body.order_id ?? ""))
    .maybeSingle();

  // Unknown order: say OK so NOWPayments stops retrying, but do nothing.
  if (!order) return NextResponse.json({ ok: true });

  // Extra safety: the invoice price must match what we stored.
  if (Math.round(Number(body.price_amount) * 100) !== order.price_cents) {
    await supabase.from("crypto_orders").update({ status: "needs_refund" }).eq("id", order.id);
    return NextResponse.json({ ok: true });
  }

  const status = body.payment_status;
  const paymentId = body.payment_id != null ? String(body.payment_id) : null;

  if (status === "finished") {
    const { error } = await supabase.rpc("complete_crypto_order", {
      p_order_id: order.id,
      p_payment_id: paymentId,
      p_pay_currency: body.pay_currency ?? null,
      p_actually_paid: body.actually_paid != null ? Number(body.actually_paid) : null,
    });
    // On a database error, answer 500 so NOWPayments retries later.
    if (error) return NextResponse.json({ error: "Could not finalize plot." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (status === "partially_paid") {
    await supabase
      .from("crypto_orders")
      .update({ status: "partially_paid", np_payment_id: paymentId, actually_paid: body.actually_paid })
      .eq("id", order.id)
      .eq("status", "pending");
    return NextResponse.json({ ok: true });
  }

  if (status === "expired" || status === "failed") {
    const { data: changed } = await supabase
      .from("crypto_orders")
      .update({ status })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");
    if (changed && changed.length) {
      // Free the plot so someone else can buy it.
      await supabase.from("plots").update({ reserved_until: null }).eq("id", order.plot_id).eq("status", "available");
    }
    return NextResponse.json({ ok: true });
  }

  // waiting / confirming / confirmed / sending: nothing to do yet.
  return NextResponse.json({ ok: true });
}
