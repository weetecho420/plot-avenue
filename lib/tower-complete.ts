import { supabaseAdmin } from "@/lib/supabase";

// Called by the Stripe and PayMongo webhooks once a Neon Tower payment is confirmed.
// amountOk = the payment matched the order (otherwise it's flagged for a refund).
export async function completeTowerOrder(orderId: string, opts: { amountOk: boolean; sessionId: string | null; paymentRef: string | null; email: string | null }) {
  const supabase = supabaseAdmin();
  const { data: order } = await supabase.from("tower_orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order || order.status === "paid") return { ok: true };
  if (!opts.amountOk) {
    await supabase
      .from("tower_orders")
      .update({ status: "needs_refund", session_id: opts.sessionId, payment_ref: opts.paymentRef, customer_email: opts.email })
      .eq("id", order.id);
    return { ok: true };
  }
  const { error } = await supabase.rpc("complete_tower_order", {
    p_order_id: order.id,
    p_session_id: opts.sessionId,
    p_payment_ref: opts.paymentRef,
    p_email: opts.email,
  });
  return { ok: !error };
}
