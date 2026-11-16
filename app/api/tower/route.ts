import { NextResponse } from "next/server";
import { getTower } from "@/lib/tower";

// GET /api/tower — who's on the Neon Tower, what the next takeover costs, and the Hall of Fame.
// Public (the social bot reads this to announce takeovers).
export const revalidate = 0;

export async function GET() {
  const t = await getTower();
  return NextResponse.json(
    {
      owner_name: t.state.owner_name,
      website_url: t.state.website_url,
      message: t.state.message,
      price_cents: t.state.price_cents,
      takeovers: t.state.takeovers ?? 0,
      taken_at: t.state.taken_at,
      next_price_cents: t.next_price_cents,
      history: t.history.slice(0, 10).map((h) => ({ no: h.takeover_no, owner_name: h.owner_name, price_cents: h.price_cents, at: h.created_at })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
