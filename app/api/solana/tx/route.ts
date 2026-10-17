import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { buildPaymentTx, treasury } from "@/lib/solana";
import { getOrder, holdExpired, isUuid } from "@/lib/solana-orders";

// POST /api/solana/tx  { orderId }
// A fresh copy of the payment transaction (new blockhash) for a retry, e.g.
// when the buyer took too long to approve in Phantom.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.orderId)) return NextResponse.json({ error: "Missing order." }, { status: 400 });

  const order = await getOrder(body.orderId);
  if (!order || order.status !== "pending") {
    return NextResponse.json({ error: "This order can no longer be paid." }, { status: 409 });
  }
  if (holdExpired(order)) {
    return NextResponse.json({ error: "Your hold on this plot ran out. Please start again." }, { status: 409 });
  }

  try {
    const transaction = await buildPaymentTx({
      buyer: new PublicKey(order.buyer_wallet),
      treasury: treasury()!,
      lamports: Number(order.lamports),
      reference: new PublicKey(order.reference),
    });
    return NextResponse.json({ transaction });
  } catch {
    return NextResponse.json({ error: "Solana network is busy. Please try again." }, { status: 502 });
  }
}
