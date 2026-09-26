import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { releaseHold } from "@/lib/checkout";

// POST /api/paypal/cancel  { orderID }
// Called when the buyer closes the PayPal popup, so the plot is freed right away.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const paypalOrderId = typeof body.orderID === "string" ? body.orderID.slice(0, 64) : "";
  if (!paypalOrderId) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: changed } = await supabaseAdmin()
    .from("paypal_orders")
    .update({ status: "cancelled" })
    .eq("paypal_order_id", paypalOrderId)
    .eq("status", "pending")
    .select("plot_id");

  if (changed && changed.length) await releaseHold(changed[0].plot_id);
  return NextResponse.json({ ok: true });
}
