import { supabasePublic } from "@/lib/supabase";
import Link from "next/link";
import CityScene from "./CityScene";
import ParentStreet from "./ParentStreet";

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

  const { data: streetProducts } = await supabasePublic
    .from("street_products")
    .select("id, title, blurb, price_cents, image_url")
    .eq("street", "parent")
    .order("sort", { ascending: true });

  const claimed = (plots ?? []).filter((p) => p.status === "claimed");
  // House plots are Plot Avenue's own projects, placed free: lit, but not sales.
  const sold = claimed.filter((p) => !p.house);
  const houseNames = new Set(claimed.filter((p) => p.house).map((p) => String(p.owner_name).toLowerCase()));
  const totalCents = sold.reduce((sum, p) => sum + p.price_cents, 0);
  const realSales = (sales ?? []).filter((s) => !houseNames.has(String(s.owner_name).toLowerCase()));

  return (
    <main className="wrap">
      <div className="masthead">
        <h1>Plot Avenue</h1>
        <div className="tagline">Claim a building. One payment, permanent spot on the street.</div>
      </div>

      <div className="stats">
        <div><b>{claimed.length} of {plots?.length ?? 0}</b>buildings lit</div>
        <div><b>{(plots?.length ?? 0) - claimed.length}</b>still dark, for sale</div>
        <div><b>${(totalCents / 100).toLocaleString()}</b>total sales</div>
      </div>

      <CityScene plots={plots ?? []} />
      <p className="av-legend">
        Every sale switches a building on (the first few lit ones are our own projects). Tap a dark one to claim that exact spot, or a lit one to visit its owner.
      </p>

      <Link href="/claim" className="cta">Claim a plot from $5</Link>

      <ParentStreet products={streetProducts ?? []} />

      <div className="feed">
        {realSales.map((s, i) => (
          <div className="feed-row" key={i}>
            <span className="name">{s.owner_name}</span>
            <span className="price">${(s.price_cents / 100).toFixed(0)}</span>
          </div>
        ))}
        {realSales.length === 0 && (
          <div className="feed-row"><span className="name">No sales yet — be the first.</span></div>
        )}
      </div>
    </main>
  );
}
