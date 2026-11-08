import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Parent Street card clicks: count the click, then send the visitor to the product.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const home = new URL("/", req.url);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.redirect(home);

  const { data: dest } = await supabaseAdmin().rpc("bump_street_click", { p_id: params.id });
  if (typeof dest !== "string" || !/^https?:\/\//.test(dest)) return NextResponse.redirect(home);
  return NextResponse.redirect(dest, 302);
}
