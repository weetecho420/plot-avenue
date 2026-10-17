import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { releaseHold } from "@/lib/checkout";
import { findPayment, treasury } from "@/lib/solana";
import { getOrder, isUuid } from "@/lib/solana-orders";

// POST /api/solana/cancel  { orderId }
// Buyer rejected the transaction in Phantom: free the plot right away —
// but only after double-checking nothing was actually paid.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.orderId)) return NextResponse.json({ ok: false }, { status: 400 });

  const order = await getOrder(body.orderId);
  if (!order || order.status !== "pending") return NextResponse.json({ ok: true });

  try {
    const pay = await findPayment({
      buyer: order.buyer_wallet,
      treasury: treasury()!.toBase58(),
      lamports: Number(order.lamports),
      reference: order.reference,
    });
    if (pay.ok) return NextResponse.json({ ok: false, paid: true });
  } catch {
    // Can't reach Solana: keep the hold; it expires on its own.
    return NextResponse.json({ ok: true });
  }

  const { data: changed } = await supabaseAdmin()
    .from("solana_orders")
    .update({ status: "cancelled" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("plot_id");
  if (changed && changed.length) await releaseHold(changed[0].plot_id);
  return NextResponse.json({ ok: true });
}
