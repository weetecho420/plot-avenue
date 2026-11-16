import Link from "next/link";
import NeonTower from "../NeonTower";
import TowerForm from "./TowerForm";
import { getTower, usd } from "@/lib/tower";
import { phpPerUsd } from "@/lib/fx";

export const revalidate = 0;
export const metadata = {
  title: "The Neon Tower — Plot Avenue",
  description: "One giant sign. Anyone can take it over. Every takeover costs $1 more, and every owner stays in the Hall of Fame forever.",
};

export default async function TowerPage({ searchParams }: { searchParams: { done?: string } }) {
  const t = await getTower();
  const rate = await phpPerUsd().catch(() => 62);
  const php = `₱${Math.ceil((t.next_price_cents / 100) * rate).toLocaleString()}`;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main className="wrap">
      <div className="masthead">
        <h1><Link href="/" className="plainlink">Plot Avenue</Link></h1>
        <div className="tagline">One sign. Anyone can take it. +$1 every time.</div>
      </div>

      {searchParams.done && (
        <p className="nt-done">
          🎉 Payment received! Your name goes up on the tower in a few seconds. Refresh to see it, then share it so
          your friends can see you on top.
        </p>
      )}

      <NeonTower state={t.state} nextCents={t.next_price_cents} showCta={false} />

      <h2 className="nt-h2">Take over the tower for {usd(t.next_price_cents)}</h2>
      <TowerForm nextLabel={usd(t.next_price_cents)} phpLabel={php} />

      <h2 className="nt-h2">Hall of Fame</h2>
      {t.history.length ? (
        <ol className="nt-hall">
          {t.history.map((h) => (
            <li key={h.takeover_no}>
              <span className="nt-no">#{h.takeover_no}</span>
              <a href={h.website_url} target="_blank" rel="sponsored noopener">{h.owner_name}</a>
              {h.message ? <span className="nt-hmsg">“{h.message}”</span> : null}
              <span className="nt-hmeta">{usd(h.price_cents)} · {fmt(h.created_at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nobody yet. The first owner is remembered here forever.</p>
      )}
    </main>
  );
}
