import { supabaseAdmin } from "@/lib/supabase";
import { findPayment, treasury } from "@/lib/solana";
import { mintPlotNft } from "@/lib/nft";

// Server-only. Shared by the Solana confirm / tx / cancel routes.

export const SOLANA_HOLD_MINUTES = 15;

export type SolanaOrder = {
  id: string;
  plot_id: string;
  owner_name: string;
  buyer_wallet: string;
  reference: string;
  lamports: number;
  status: string;
  nft_status: string;
  nft_asset: string | null;
  created_at: string;
};

const ORDER_FIELDS =
  "id, plot_id, owner_name, buyer_wallet, reference, lamports, status, nft_status, nft_asset, created_at";

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function getOrder(id: string): Promise<SolanaOrder | null> {
  const { data } = await supabaseAdmin().from("solana_orders").select(ORDER_FIELDS).eq("id", id).maybeSingle();
  return (data as SolanaOrder) ?? null;
}

export function holdExpired(order: SolanaOrder) {
  return Date.now() > new Date(order.created_at).getTime() + SOLANA_HOLD_MINUTES * 60_000;
}

export type ConfirmResult =
  | { result: "paid"; nft: { status: string; asset: string | null } }
  | { result: "waiting" }
  | { result: "plot_taken" }
  | { result: "problem"; reason: string };

// Checks the chain for this order's payment and, if found, claims the plot
// and mints the NFT. Safe to call any number of times.
export async function confirmOrder(order: SolanaOrder): Promise<ConfirmResult> {
  const supabase = supabaseAdmin();

  if (order.status === "pending" || order.status === "cancelled") {
    const pay = await findPayment({
      buyer: order.buyer_wallet,
      treasury: treasury()!.toBase58(),
      lamports: Number(order.lamports),
      reference: order.reference,
    });

    if (!pay.ok) {
      if (pay.reason === "not_found") return { result: "waiting" };
      // A failed transaction moved no money: the buyer can simply try again.
      if (pay.reason === "failed") return { result: "problem", reason: "failed" };
      await supabase.from("solana_orders").update({ status: "needs_refund" }).eq("id", order.id).eq("status", order.status);
      return { result: "problem", reason: pay.reason };
    }

    const { data: r, error } = await supabase.rpc("complete_solana_order", {
      p_order_id: order.id,
      p_signature: pay.signature!,
    });
    if (error) throw new Error("complete_solana_order failed");
    if (r === "plot_taken") return { result: "plot_taken" };
    order = (await getOrder(order.id))!;
  }

  if (order.status === "needs_refund") return { result: "plot_taken" };
  if (order.status !== "paid") return { result: "problem", reason: order.status };

  // Paid — make sure the NFT exists.
  if (order.nft_status !== "minted") {
    const { data: mine } = await supabase.rpc("start_solana_nft_mint", { p_order_id: order.id });
    if (mine) {
      try {
        const { data: plot } = await supabase
          .from("plots")
          .select("slot_index, tier")
          .eq("id", order.plot_id)
          .single();
        const asset = await mintPlotNft({
          plotId: order.plot_id,
          slotIndex: plot!.slot_index,
          tier: plot!.tier,
          ownerName: order.owner_name,
          ownerWallet: order.buyer_wallet,
        });
        await supabase.from("solana_orders").update({ nft_status: "minted", nft_asset: asset }).eq("id", order.id);
        await supabase.from("plots").update({ nft_asset: asset }).eq("id", order.plot_id);
        return { result: "paid", nft: { status: "minted", asset } };
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "mint failed";
        await supabase.from("solana_orders").update({ nft_status: "failed", nft_error: msg }).eq("id", order.id);
        return { result: "paid", nft: { status: "failed", asset: null } };
      }
    }
    return { result: "paid", nft: { status: "minting", asset: null } };
  }

  return { result: "paid", nft: { status: "minted", asset: order.nft_asset } };
}
