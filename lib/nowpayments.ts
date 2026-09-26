import crypto from "crypto";

// Server-only helpers for NOWPayments. NEVER import this into a client component.

export const NP_API = "https://api.nowpayments.io/v1";

// NOWPayments signs its webhook (IPN) with HMAC-SHA512 over the JSON body,
// with all object keys sorted alphabetically.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return value;
}

export function signIpnBody(body: unknown, secret: string) {
  return crypto.createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
}

export function isValidIpnSignature(body: unknown, header: string | null, secret: string | undefined) {
  if (!header || !secret) return false;
  const expected = Buffer.from(signIpnBody(body, secret), "utf8");
  const given = Buffer.from(header, "utf8");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
