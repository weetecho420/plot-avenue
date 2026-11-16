import Link from "next/link";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase";

export const revalidate = 300;

const TIER_NAME: Record<string, string> = { kiosk: "Kiosk", shop: "Shop front", tower: "Tower", skyscraper: "Skyscraper" };

async function load(slot: string) {
  const n = Number(slot) - 1;
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null;
  const { data } = await supabasePublic
    .from("plots")
    .select("slot_index, tier, price_cents, status, owner_name, website_url, logo_url, claimed_at")
    .eq("slot_index", n)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slot: string } }) {
  const p = await load(params.slot);
  if (!p) return { title: "Plot Avenue" };
  return p.status === "claimed"
    ? { title: `${p.owner_name} on Plot Avenue (plot #${p.slot_index + 1})`, description: `${p.owner_name} has a ${TIER_NAME[p.tier]?.toLowerCase()} on Plot Avenue, the neon city of internet businesses.` }
    : { title: `Plot #${p.slot_index + 1} is for sale — Plot Avenue`, description: `Claim this ${TIER_NAME[p.tier]?.toLowerCase()} on Plot Avenue for $${p.price_cents / 100}.` };
}

export default async function PlotPage({ params }: { params: { slot: string } }) {
  const p = await load(params.slot);
  if (!p) notFound();
  const no = p.slot_index + 1;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://plot-avenue.vercel.app").replace(/\/$/, "");
  const share = encodeURIComponent(`${site}/plot/${no}`);
  const text = encodeURIComponent(p.status === "claimed" ? `${p.owner_name} is on Plot Avenue 🌃` : `Plot #${no} on Plot Avenue is for sale`);

  return (
    <main className="wrap">
      <div className="masthead">
        <h1><Link href="/" className="plainlink">Plot Avenue</Link></h1>
        <div className="tagline">Plot #{no} · {TIER_NAME[p.tier]}</div>
      </div>

      {p.status === "claimed" ? (
        <section className="plotcard">
          {p.logo_url ? <img src={p.logo_url} alt="" className="plotlogo" /> : null}
          <h2>{p.owner_name}</h2>
          <p className="muted">
            Owns a {TIER_NAME[p.tier]?.toLowerCase()} on Plot Avenue
            {p.claimed_at ? ` since ${new Date(p.claimed_at).toLocaleDateString("en-NZ", { month: "long", year: "numeric" })}` : ""}.
          </p>
          {p.website_url && (
            <a className="cta" href={p.website_url} target="_blank" rel="sponsored noopener">
              Visit {p.owner_name} →
            </a>
          )}
          <div className="sharerow">
            <span className="muted">Share this plot:</span>
            <a href={`https://x.com/intent/post?url=${share}&text=${text}`} target="_blank" rel="noopener">X</a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${share}`} target="_blank" rel="noopener">Facebook</a>
          </div>
        </section>
      ) : (
        <section className="plotcard">
          <h2>This {TIER_NAME[p.tier]?.toLowerCase()} is still dark</h2>
          <p className="muted">Light it up with your logo and link. One payment, permanent spot on the street.</p>
          <Link className="cta" href={`/claim?slot=${p.slot_index}`}>Claim plot #{no} for ${p.price_cents / 100}</Link>
        </section>
      )}

      <p><Link href="/" className="muted">← Back to the avenue</Link> · <Link href="/tower" className="muted">The Neon Tower</Link></p>
    </main>
  );
}
