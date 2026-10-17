import { supabasePublic } from "@/lib/supabase";
import { TIER_NAME } from "@/lib/nft";

// GET /api/nft/<plot id>/image — a simple building picture, used as the NFT
// image when the buyer didn't give a logo.
const HEIGHT: Record<string, number> = { kiosk: 140, shop: 190, tower: 260, skyscraper: 320 };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(_req: Request, { params }: { params: { plotId: string } }) {
  const { data: plot } = await supabasePublic
    .from("plots")
    .select("slot_index, tier, color, owner_name")
    .eq("id", params.plotId)
    .maybeSingle();
  if (!plot) return new Response("Not found", { status: 404 });

  const h = HEIGHT[plot.tier] ?? 180;
  const color = /^#[0-9a-f]{6}$/i.test(plot.color ?? "") ? plot.color : "#5B6B73";
  const top = 400 - h;
  let windows = "";
  for (let y = top + 20; y < 380; y += 28) {
    for (let x = 175; x < 330; x += 34) windows += `<rect x="${x}" y="${y}" width="18" height="14" fill="#f3c33f" opacity="0.8"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#0d1520"/>
<rect x="160" y="${top}" width="192" height="${h}" fill="${color}"/>${windows}
<rect x="0" y="400" width="512" height="112" fill="#1c232c"/>
<text x="256" y="455" fill="#f3efe6" font-family="Georgia,serif" font-size="30" text-anchor="middle">${esc(plot.owner_name ?? "")}</text>
<text x="256" y="490" fill="#f3c33f" font-family="Arial,sans-serif" font-size="18" text-anchor="middle">PLOT AVENUE #${plot.slot_index + 1} · ${esc((TIER_NAME[plot.tier] ?? "Plot").toUpperCase())}</text>
</svg>`;

  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
}
