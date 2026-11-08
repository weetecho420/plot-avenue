import Link from "next/link";

export type StreetProduct = {
  id: string;
  title: string;
  blurb: string | null;
  price_cents: number | null;
  image_url: string | null;
};

// Open cards shown after the real products, so the street always reads as "room to join".
const OPEN_SPOTS = 3;

export default function ParentStreet({ products }: { products: StreetProduct[] }) {
  const open = Math.max(1, OPEN_SPOTS - products.length);

  return (
    <section className="ps" aria-labelledby="ps-title">
      <div className="ps-head">
        <span className="ps-sign">Parent Street</span>
        <h2 id="ps-title">Tools that help families</h2>
        <p>Guides and printables for parents. Every card links straight to the shop that made it.</p>
      </div>

      <div className="ps-grid">
        {products.map((p) => (
          <a key={p.id} href={`/go/${p.id}`} target="_blank" rel="noopener" className="ps-card">
            <span className="ps-img">
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : null}
            </span>
            <span className="ps-body">
              <span className="ps-title">{p.title}</span>
              {p.blurb && <span className="ps-blurb">{p.blurb}</span>}
              <span className="ps-foot">
                {p.price_cents != null && <span className="ps-price">${(p.price_cents / 100).toFixed(2)}</span>}
                <span className="ps-go">Get it →</span>
              </span>
            </span>
          </a>
        ))}

        {Array.from({ length: open }).map((_, i) => (
          <Link key={`open-${i}`} href="/claim" className="ps-card ps-open">
            <span className="ps-open-plus" aria-hidden="true">+</span>
            <span className="ps-title">Your parenting shop here</span>
            <span className="ps-blurb">Sell guides, printables or courses for parents? Claim a plot and put your shop on this street.</span>
            <span className="ps-go">Claim a plot from $5 →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
