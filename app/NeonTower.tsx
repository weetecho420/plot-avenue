import Link from "next/link";
import type { TowerState } from "@/lib/tower";
import { usd } from "@/lib/tower";

// The big neon billboard. Used on the home page (with a "Take it over" button) and on /tower.
export default function NeonTower({ state, nextCents, showCta = true }: { state: TowerState; nextCents: number; showCta?: boolean }) {
  const empty = !state.owner_name;
  return (
    <section className="nt" aria-labelledby="nt-title">
      <div className="nt-top">
        <span className="nt-live" aria-hidden="true" />
        <h2 id="nt-title">The Neon Tower</h2>
        <span className="nt-count">
          {state.takeovers ? `Taken over ${state.takeovers} time${state.takeovers === 1 ? "" : "s"}` : "Never taken yet"}
        </span>
      </div>

      <div className="nt-screen">
        {empty ? (
          <div className="nt-empty">
            <b>This tower is empty.</b>
            <span>Be the first name on the biggest sign on the avenue, for {usd(nextCents)}.</span>
          </div>
        ) : (
          <a className="nt-ad" href={state.website_url ?? "#"} target="_blank" rel="sponsored noopener">
            {state.logo_url ? <img src={state.logo_url} alt="" /> : null}
            <span className="nt-name">{state.owner_name}</span>
            {state.message ? <span className="nt-msg">{state.message}</span> : null}
            <span className="nt-paid">paid {usd(state.price_cents)} to be here</span>
          </a>
        )}
      </div>

      <div className="nt-foot">
        <span>
          Next takeover <b>{usd(nextCents)}</b> <span className="muted">· +$1 every time</span>
        </span>
        {showCta && (
          <Link href="/tower" className="nt-cta">
            {empty ? "Claim it" : "Take it over"} →
          </Link>
        )}
      </div>
    </section>
  );
}
