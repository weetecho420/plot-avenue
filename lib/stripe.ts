import crypto from "crypto";

// Stripe card checkout, called over plain HTTPS (no SDK needed). Server-only.
// The button stays hidden until NEXT_PUBLIC_STRIPE_ENABLED=1 and
// STRIPE_SECRET_KEY are set.

export const isStripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

// Stripe wants form-encoded bodies with nested keys like line_items[0][price_data][currency].
function encode(obj: Record<string, unknown>, prefix = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripePost(path: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encode(params).join("&"),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Stripe-Signature: t=<timestamp>,v1=<sig>[,v1=<sig>...]
// sig = HMAC-SHA256("<timestamp>.<raw body>", whsec_...). Reject anything
// older than 5 minutes so an old event can't be replayed.
export function verifyStripeSignature(rawBody: string, header: string, secret: string | undefined) {
  if (!secret || !header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some(
    (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))
  );
}
