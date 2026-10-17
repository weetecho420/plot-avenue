import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/nft";

// GET /api/nft/collection — metadata for the optional "Plot Avenue" collection.
export async function GET() {
  const base = siteUrl();
  return NextResponse.json(
    {
      name: "Plot Avenue",
      symbol: "PLOT",
      description: "Each NFT proves ownership of one building on Plot Avenue.",
      image: `${base}/api/nft/collection/image`,
      external_url: base,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
