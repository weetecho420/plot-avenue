import { NextResponse } from "next/server";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { supabaseAdmin } from "@/lib/supabase";
import { parseClaim, holdPlotInTier, releaseHold } from "@/lib/checkout";
import {
  CLUSTER,
  buildPaymentTx,
  isSolanaEnabled,
  newReference,
  parseWallet,
  solUsd,
  treasury,
  usdCentsToLamports,
} from "@/lib/solana";
import { SOLANA_HOLD_MINUTES } from "@/lib/solana-orders";

// POST /api/solana/create  { tier, owner_name, website_url, logo_url?, wallet }
// Holds the next open plot in that tier, locks a SOL price for it, and
// returns an unsigned transfer transaction for Phantom to sign.
export async function POST(req: Request) {
  if (!isSolanaEnabled()) {
    return NextResponse.json({ error: "Solana payments aren't switched on yet." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const input = parseClaim(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const buyer = parseWallet(body?.wallet);
  if (!buyer) return NextResponse.json({ error: "Connect your Phantom wallet first." }, { status: 400 });
  const to = treasury()!;
  if (buyer.equals(to)) {
    return NextResponse.json({ error: "That's the shop's own wallet. Pay from a different wallet." }, { status: 400 });
  }

  let price: number;
  try {
    price = await solUsd();
  } catch {
    return NextResponse.json({ error: "Couldn't get the SOL price. Please try again." }, { status: 502 });
  }

  const held = await holdPlotInTier(input.tier, SOLANA_HOLD_MINUTES);
  if (!held) return NextResponse.json({ error: "No plots left in that tier right now." }, { status: 409 });

  const lamports = usdCentsToLamports(held.price_cents, price);
  const reference = newReference();
  const supabase = supabaseAdmin();

  const { data: order, error } = await supabase
    .from("solana_orders")
    .insert({
      plot_id: held.id,
      owner_name: input.ownerName,
      website_url: input.websiteUrl,
      logo_url: input.logoUrl,
      price_cents: held.price_cents,
      buyer_wallet: buyer.toBase58(),
      reference,
      lamports,
      sol_usd: price,
      cluster: CLUSTER,
    })
    .select("id")
    .single();

  if (error || !order) {
    await releaseHold(held.id);
    return NextResponse.json({ error: "Could not create order." }, { status: 500 });
  }

  try {
    const transaction = await buildPaymentTx({
      buyer,
      treasury: to,
      lamports,
      reference: new PublicKey(reference),
    });
    return NextResponse.json({
      orderId: order.id,
      sol: lamports / LAMPORTS_PER_SOL,
      cluster: CLUSTER,
      transaction,
    });
  } catch {
    await supabase.from("solana_orders").update({ status: "failed" }).eq("id", order.id);
    await releaseHold(held.id);
    return NextResponse.json({ error: "Solana network is busy. Please try again." }, { status: 502 });
  }
}
