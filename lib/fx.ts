// USD -> PHP conversion for the PayMongo (GCash / card) checkout.
// Plot prices are stored in US cents; PayMongo charges in PHP centavos.

// Used only if the live rate can't be fetched. Update it now and then,
// or set PHP_PER_USD in Vercel to override it.
const FALLBACK_PHP_PER_USD = 62;

async function liveRate(): Promise<number | null> {
  try {
    // Free, no API key. Cached by Next.js for 1 hour.
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const data = await r.json();
    const rate = Number(data?.rates?.PHP);
    // Sanity check so a bad response can never make plots too cheap or too dear.
    return rate > 40 && rate < 100 ? rate : null;
  } catch {
    return null;
  }
}

export async function phpPerUsd(): Promise<number> {
  const manual = Number(process.env.PHP_PER_USD);
  if (manual > 0) return manual;
  return (await liveRate()) ?? FALLBACK_PHP_PER_USD;
}

// US cents -> PHP centavos, rounded UP to a whole peso (e.g. $5 -> ₱313.00).
export async function usdCentsToPhpCentavos(usdCents: number): Promise<number> {
  const rate = await phpPerUsd();
  return Math.ceil((usdCents / 100) * rate) * 100;
}
