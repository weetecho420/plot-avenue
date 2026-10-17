import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase";
import { TIER_NAME, siteUrl } from "@/lib/nft";

// GET /api/nft/<plot id> — the NFT's metadata (Metaplex JSON standard).
// Wallets like Phantom read this to show the NFT's name and picture.
export async function GET(_req: Request, { params }: { params: { plotId: string } }) {
  const { data: plot } = await supabasePublic
    .from("plots")
    .select("id, slot_index, tier, status, owner_name, website_url, logo_url, claimed_at")
    .eq("id", params.plotId)
    .maybeSingle();

  if (!plot || plot.status !== "claimed") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tier = TIER_NAME[plot.tier] ?? "Plot";
  const base = siteUrl();
  const image = plot.logo_url || `${base}/api/nft/${plot.id}/image`;

  return NextResponse.json(
    {
      name: `Plot Avenue #${plot.slot_index + 1} · ${tier}`,
      symbol: "PLOT",
      description: `Proof of ownership of ${tier} plot #${plot.slot_index + 1} on Plot Avenue, claimed by ${plot.owner_name}.`,
      image,
      external_url: base,
      attributes: [
        { trait_type: "Tier", value: tier },
        { trait_type: "Plot", value: String(plot.slot_index + 1) },
        { trait_type: "Owner", value: plot.owner_name },
        { trait_type: "Website", value: plot.website_url },
      ],
      properties: { category: "image", files: [{ uri: image, type: plot.logo_url ? "image/png" : "image/svg+xml" }] },
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
