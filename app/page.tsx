import { supabasePublic } from "@/lib/supabase";
import Link from "next/link";

const TIER_HEIGHT: Record<string, number> = {
  kiosk: 90,
  shop: 160,
  tower: 260,
  skyscraper: 320,
};

export const revalidate = 0;

export default async function HomePage() {
  const { data: plots } = await supabasePublic
    .from("plots")
    .select("*")
    .order("slot_index", { ascending: true });

  const { data: sales } = await supabasePublic
    .from("sales_log")
    .select("owner_name, price_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  const claimed = (plots ?? []).filter((p) => p.status === "claimed");
  const totalCents = claimed.reduce((sum, p) => sum + p.price_cents, 0);

  return (
    <main className="wrap">
      <div className="masthead">
        <h1>Plot Avenue</h1>
        <div className="tagline">Claim a building. One payment, permanent spot on the street.</div>
      </div>

      <div className="stats">
        <div><b>${(totalCents / 100).toLocaleString()}</b>total sales</div>
        <div><b>{claimed.length}</b>plots claimed</div>
        <div><b>{(plots?.length ?? 0) - claimed.length}</b>plots open</div>
      </div>

      <div className="skyline">
        {(plots ?? []).map((p) => {
          const height = TIER_HEIGHT[p.tier] ?? 120;
          if (p.status === "claimed") {
            return (
              <a
                key={p.id}
                href={p.website_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="building"
                style={{ height, background: p.color }}
              >
                <span className="sign">{p.owner_name}</span>
              </a>
            );
          }
          return (
            <Link
              key={p.id}
              href={`/claim?slot=${p.slot_index}`}
              className="building available"
              style={{ height: Math.max(70, height * 0.55) }}
            >
              <span className="price">${(p.price_cents / 100).toFixed(0)}</span>
            </Link>
          );
        })}
      </div>
      <div className="ground" />

      <Link href="/claim" className="cta">Claim a plot from $5</Link>

      <div className="feed">
        {(sales ?? []).map((s, i) => (
          <div className="feed-row" key={i}>
            <span className="name">{s.owner_name}</span>
            <span className="price">${(s.price_cents / 100).toFixed(0)}</span>
          </div>
        ))}
        {(sales ?? []).length === 0 && (
          <div className="feed-row"><span className="name">No sales yet — be the first.</span></div>
        )}
      </div>
    </main>
  );
}
