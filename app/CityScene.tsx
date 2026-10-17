"use client";

import Link from "next/link";
import { useRef } from "react";
import type { CSSProperties } from "react";

type Plot = {
  id: string;
  slot_index: number;
  tier: string;
  price_cents: number;
  status: string;
  owner_name: string | null;
  website_url: string | null;
  logo_url: string | null;
};

// Building size per tier, and the neon colour of its rooftop billboard.
const TIER: Record<string, { w: number; h: number; neon: string; name: string }> = {
  kiosk: { w: 58, h: 92, neon: "#5BE7F2", name: "Kiosk" },
  shop: { w: 74, h: 142, neon: "#FF6FB1", name: "Shop front" },
  tower: { w: 86, h: 214, neon: "#FFB547", name: "Tower" },
  skyscraper: { w: 98, h: 292, neon: "#B596FF", name: "Skyscraper" },
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;

function Building({ p }: { p: Plot }) {
  const t = TIER[p.tier] ?? TIER.shop;
  const lit = p.status === "claimed";
  const style = {
    "--w": `${t.w}px`,
    "--h": `${t.h}px`,
    "--neon": t.neon,
    // Small per-building shift so the windows don't line up like a grid.
    "--win-shift": `${(p.slot_index * 7) % 13}px`,
  } as CSSProperties;

  const body = (
    <>
      {lit ? (
        <span className="av-billboard">
          {p.logo_url ? <img src={p.logo_url} alt="" loading="lazy" /> : null}
          <span className="av-billboard-name">{p.owner_name}</span>
        </span>
      ) : (
        <span className="av-roof-gap" />
      )}
      <span className={`av-body tier-${p.tier}`}>
        {!lit && <span className="av-price">{dollars(p.price_cents)}</span>}
      </span>
    </>
  );

  if (lit) {
    return (
      <a
        href={p.website_url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="av-building is-lit"
        style={style}
        aria-label={`${p.owner_name} — plot ${p.slot_index + 1}, visit their site`}
        title={p.owner_name ?? undefined}
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      href={`/claim?slot=${p.slot_index}`}
      className="av-building is-dark"
      style={style}
      aria-label={`Claim plot ${p.slot_index + 1}: ${t.name}, ${dollars(p.price_cents)}`}
      title={`Claim plot #${p.slot_index + 1} · ${t.name} · ${dollars(p.price_cents)}`}
    >
      {body}
    </Link>
  );
}

export default function CityScene({ plots }: { plots: Plot[] }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="av-scene">
      <div className="av-sky" aria-hidden="true">
        <span className="av-moon" />
      </div>

      <div className="av-scroller" ref={scroller}>
        <div className="av-avenue">
          <div className="av-backdrop" aria-hidden="true" />
          <div className="av-row">
            {plots.map((p) => (
              <Building key={p.id} p={p} />
            ))}
          </div>
          <div className="av-street" aria-hidden="true">
            <span className="av-car av-car-east" />
            <span className="av-car av-car-west" />
          </div>
        </div>
      </div>

      <div className="av-nav">
        <button type="button" onClick={() => nudge(-1)} aria-label="Scroll the avenue left">‹</button>
        <button type="button" onClick={() => nudge(1)} aria-label="Scroll the avenue right">›</button>
      </div>
    </div>
  );
}
