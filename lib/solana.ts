import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

// Server-only helpers for the Phantom (SOL) checkout.

// "devnet" while testing, "mainnet-beta" for real money.
export const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";

export function rpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    (CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com")
  );
}

export function connection() {
  return new Connection(rpcUrl(), "confirmed");
}

// Where buyers' SOL goes: your own Phantom wallet address.
export function treasury(): PublicKey | null {
  try {
    return process.env.SOLANA_TREASURY_ADDRESS ? new PublicKey(process.env.SOLANA_TREASURY_ADDRESS) : null;
  } catch {
    return null;
  }
}

export function isSolanaEnabled() {
  return !!process.env.NEXT_PUBLIC_SOLANA_CLUSTER && !!treasury() && !!process.env.SOLANA_MINT_SECRET_KEY;
}

export function parseWallet(v: unknown): PublicKey | null {
  if (typeof v !== "string" || v.length < 32 || v.length > 44) return null;
  try {
    const pk = new PublicKey(v);
    return PublicKey.isOnCurve(pk.toBytes()) ? pk : null;
  } catch {
    return null;
  }
}

// ───────────── price ─────────────
const sane = (n: number) => (n > 1 && n < 100000 ? n : null);

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// USD price of 1 SOL. Two free sources so one being down doesn't stop sales.
export async function solUsd(): Promise<number> {
  const manual = Number(process.env.SOL_USD);
  if (manual > 0) return manual;
  try {
    const d = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const v = sane(Number(d?.solana?.usd));
    if (v) return v;
  } catch {}
  try {
    const d = await fetchJson("https://api.coinbase.com/v2/prices/SOL-USD/spot");
    const v = sane(Number(d?.data?.amount));
    if (v) return v;
  } catch {}
  throw new Error("SOL price unavailable");
}

// US cents → lamports, rounded up to the nearest 0.00001 SOL.
export function usdCentsToLamports(usdCents: number, solPriceUsd: number): number {
  const sol = usdCents / 100 / solPriceUsd;
  const step = 10_000; // 0.00001 SOL
  return Math.ceil((sol * LAMPORTS_PER_SOL) / step) * step;
}

export function newReference(): string {
  return Keypair.generate().publicKey.toBase58();
}

// ───────────── transaction ─────────────
// A plain SOL transfer buyer → treasury, tagged with the order's unique
// "reference" key (Solana Pay style) so we can find and verify it on-chain.
export async function buildPaymentTx(opts: {
  buyer: PublicKey;
  treasury: PublicKey;
  lamports: number;
  reference: PublicKey;
}): Promise<string> {
  const ix = SystemProgram.transfer({
    fromPubkey: opts.buyer,
    toPubkey: opts.treasury,
    lamports: opts.lamports,
  });
  ix.keys.push({ pubkey: opts.reference, isSigner: false, isWritable: false });

  const { blockhash, lastValidBlockHeight } = await connection().getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: opts.buyer, blockhash, lastValidBlockHeight }).add(ix);
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

// ───────────── verification ─────────────
export type PaymentCheck = {
  ok: boolean;
  signature?: string;
  reason?: "not_found" | "failed" | "wrong_amount" | "wrong_payer";
};

type TxLike = {
  meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null;
  transaction: { message: { accountKeys: { pubkey: PublicKey; signer: boolean }[] } };
};

// Pure check of one confirmed transaction against an order. Exported for tests.
export function checkTx(
  tx: TxLike | null,
  order: { buyer: string; treasury: string; lamports: number; reference: string }
): "ok" | "failed" | "wrong_amount" | "wrong_payer" | "unrelated" {
  if (!tx || !tx.meta) return "unrelated";
  const keys = tx.transaction.message.accountKeys.map((k) => ({ key: k.pubkey.toBase58(), signer: k.signer }));
  if (!keys.some((k) => k.key === order.reference)) return "unrelated";
  if (tx.meta.err) return "failed";

  const t = keys.findIndex((k) => k.key === order.treasury);
  if (t < 0) return "wrong_amount";
  const received = tx.meta.postBalances[t] - tx.meta.preBalances[t];
  if (received < order.lamports) return "wrong_amount";

  // The buyer we quoted must have signed it.
  if (!keys.some((k) => k.key === order.buyer && k.signer)) return "wrong_payer";
  return "ok";
}

// Looks up every transaction that mentions the order's reference key and
// returns the first valid payment. Doesn't trust anything the browser sends.
export async function findPayment(order: {
  buyer: string;
  treasury: string;
  lamports: number;
  reference: string;
}): Promise<PaymentCheck> {
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(new PublicKey(order.reference), { limit: 10 }, "confirmed");
  let lastProblem: PaymentCheck = { ok: false, reason: "not_found" };

  for (const s of sigs.reverse()) {
    const tx = await conn.getParsedTransaction(s.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const r = checkTx(tx as TxLike | null, order);
    if (r === "ok") return { ok: true, signature: s.signature };
    // A failed transaction moved no money; anything else is a real problem.
    if (r === "wrong_amount" || r === "wrong_payer") lastProblem = { ok: false, reason: r };
    else if (r === "failed" && lastProblem.reason === "not_found") lastProblem = { ok: false, reason: r };
  }
  return lastProblem;
}
