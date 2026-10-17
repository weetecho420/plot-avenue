import { NextResponse } from "next/server";
import { confirmOrder, getOrder, isUuid } from "@/lib/solana-orders";

// Minting can take a few seconds.
export const maxDuration = 60;

// POST /api/solana/confirm  { orderId }
// Looks for the order's payment on-chain (never trusts the browser), claims
// the plot and mints the NFT. Safe to call repeatedly — the browser polls it,
// and you can call it again to retry a failed mint.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.orderId)) return NextResponse.json({ error: "Missing order." }, { status: 400 });

  const order = await getOrder(body.orderId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  try {
    return NextResponse.json(await confirmOrder(order));
  } catch {
    return NextResponse.json({ error: "Couldn't check the payment. Please try again." }, { status: 502 });
  }
}
