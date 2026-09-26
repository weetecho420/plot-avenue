// Server-only PayPal helpers (Orders v2 REST API). NEVER import into a client component.

export const PAYPAL_API =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function paypalToken(): Promise<string> {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? process.env.PAYPAL_CLIENT_ID ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error("PayPal auth failed");
  return data.access_token;
}

// requestId makes retries safe: PayPal won't do the same thing twice.
export async function paypal(path: string, opts: { body?: unknown; requestId?: string } = {}) {
  const token = await paypalToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const r = await fetch(`${PAYPAL_API}${path}`, {
    method: "POST",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export const centsToValue = (cents: number) => (cents / 100).toFixed(2);
export const valueToCents = (value: unknown) => Math.round(Number(value) * 100);
