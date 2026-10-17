"use client";

import { useState } from "react";

// Pay with SOL from a Phantom wallet. The buyer also receives an NFT of their
// logo as proof they own the plot. Hidden unless NEXT_PUBLIC_SOLANA_CLUSTER is set.

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;

type Props = { getForm: () => HTMLFormElement | null };

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isMobile = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export default function PhantomButton({ getForm }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  if (!CLUSTER) return null;

  const say = (m: string, err = false) => {
    setMessage(m);
    setIsError(err);
  };

  async function pay() {
    const form = getForm();
    if (!form || !form.reportValidity()) return;

    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      if (isMobile()) {
        // Re-open this page inside the Phantom app's browser.
        const here = encodeURIComponent(window.location.href);
        window.location.href = `https://phantom.app/ul/browse/${here}?ref=${encodeURIComponent(window.location.origin)}`;
      } else {
        say("Phantom wallet not found. Install it from phantom.com, then refresh this page.", true);
      }
      return;
    }

    setBusy(true);
    say("Connecting to Phantom…");
    let orderId: string | null = null;

    try {
      const { publicKey } = await provider.connect();
      const f = new FormData(form);

      say("Reserving your plot…");
      const created = await post("/api/solana/create", {
        tier: f.get("tier"),
        slot: f.get("slot"),
        owner_name: f.get("owner_name"),
        website_url: f.get("website_url"),
        logo_url: f.get("logo_url"),
        wallet: publicKey.toString(),
      });
      if (!created.ok) throw new Error(created.data.error ?? "Couldn't start the payment.");
      orderId = created.data.orderId;

      const { Transaction } = await import("@solana/web3.js");
      let txBase64: string = created.data.transaction;

      // Ask Phantom to approve. If the transaction went stale while they
      // decided, fetch a fresh one and ask once more.
      for (let attempt = 0; ; attempt++) {
        say(`Approve the payment of ${created.data.sol} SOL in Phantom…`);
        try {
          const tx = Transaction.from(Buffer.from(txBase64, "base64"));
          await provider.signAndSendTransaction(tx);
          break;
        } catch (e: any) {
          if (e?.code === 4001) throw Object.assign(new Error("Payment cancelled."), { cancelled: true });
          const stale = /blockhash|expired/i.test(String(e?.message ?? ""));
          if (!stale || attempt > 0) throw new Error(e?.message ?? "Phantom couldn't send the payment.");
          const fresh = await post("/api/solana/tx", { orderId });
          if (!fresh.ok) throw new Error(fresh.data.error ?? "Couldn't refresh the payment.");
          txBase64 = fresh.data.transaction;
        }
      }

      // Wait for the payment to land on-chain, then the NFT mint.
      say("Payment sent! Confirming on Solana and minting your NFT…");
      for (let i = 0; i < 45; i++) {
        const c = await post("/api/solana/confirm", { orderId });
        const r = c.data.result;
        if (r === "paid" && c.data.nft?.status !== "minting") {
          const q = new URLSearchParams({ via: "solana", cluster: CLUSTER! });
          if (c.data.nft?.asset) q.set("nft", c.data.nft.asset);
          window.location.href = `/claim/success?${q}`;
          return;
        }
        if (r === "plot_taken") throw new Error("Sorry, that plot was just taken. We'll refund your SOL — contact us.");
        if (r === "problem" && c.data.reason !== "failed") {
          throw new Error("The payment didn't match the order. We'll refund you — contact us.");
        }
        if (r === "problem") throw new Error("The transaction failed on Solana, so nothing was charged. Try again.");
        await sleep(2000);
      }
      throw new Error("Still confirming. If SOL left your wallet, your plot will appear shortly — refresh the avenue in a minute.");
    } catch (e: any) {
      if (e?.cancelled && orderId) await post("/api/solana/cancel", { orderId }).catch(() => {});
      say(e?.message ?? "Something went wrong.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phantom-box">
      <button type="button" className="phantom" onClick={pay} disabled={busy}>
        {busy ? "Working…" : "Pay with Phantom (SOL) + get a plot NFT"}
      </button>
      {CLUSTER !== "mainnet-beta" && (
        <p className="phantom-note">Test mode: set Phantom to Solana devnet (Settings → Developer Settings → Testnet Mode).</p>
      )}
      {message && <p className={isError ? "phantom-msg error" : "phantom-msg"}>{message}</p>}
    </div>
  );
}
