import { NextResponse } from "next/server";
import { phpPerUsd } from "@/lib/fx";

// GET /api/fx — the PHP-per-USD rate the PayMongo checkout uses, so the claim
// page can show the peso amount on the button before the buyer pays.
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({ phpPerUsd: await phpPerUsd() });
}
