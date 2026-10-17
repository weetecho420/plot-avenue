// GET /api/nft/collection/image — a small skyline used as the collection picture.
export function GET() {
  const heights = [140, 190, 260, 190, 140, 260, 190, 140];
  const bars = heights
    .map((h, i) => `<rect x="${48 + i * 54}" y="${400 - h}" width="44" height="${h}" fill="#2e4a63"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#0d1520"/>${bars}
<rect x="0" y="400" width="512" height="112" fill="#1c232c"/>
<text x="256" y="470" fill="#f3c33f" font-family="Georgia,serif" font-size="44" text-anchor="middle">Plot Avenue</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
