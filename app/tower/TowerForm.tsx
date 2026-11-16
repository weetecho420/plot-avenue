"use client";

import { useState } from "react";

const STRIPE_ON = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "1";

export default function TowerForm({ nextLabel, phpLabel }: { nextLabel: string; phpLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const r = await fetch("/api/tower/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        via: submitter?.value === "card" ? "card" : "gcash",
        owner_name: f.get("owner_name"),
        website_url: f.get("website_url"),
        logo_url: f.get("logo_url"),
        message: f.get("message"),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.checkoutUrl) {
      setBusy(false);
      setErr(d.error ?? "Something went wrong. Please try again.");
      return;
    }
    window.location.href = d.checkoutUrl;
  }

  return (
    <form className="claim" onSubmit={submit}>
      <label>
        Your name or business
        <input name="owner_name" required maxLength={40} />
      </label>
      <label>
        Website URL
        <input name="website_url" type="url" required placeholder="https://" />
      </label>
      <label>
        Logo image URL <span className="muted">(optional)</span>
        <input name="logo_url" type="url" placeholder="https://" />
      </label>
      <label>
        Your message on the tower <span className="muted">({80 - msg.length} left)</span>
        <input name="message" maxLength={80} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Hello from Hamilton 👋" />
      </label>
      {STRIPE_ON && (
        <button type="submit" name="pay" value="card" className="card-pay" disabled={busy}>
          {busy ? "Opening checkout..." : `Take it over with card: ${nextLabel} USD`}
        </button>
      )}
      <button type="submit" name="pay" value="gcash" disabled={busy}>
        {busy ? "Opening checkout..." : `Take it over with GCash / QR Ph: ${phpLabel}`}
      </button>
      {err && <p style={{ color: "#ff6b5a" }}>{err}</p>}
      <p className="muted small">
        Your sign stays up until someone pays {nextLabel.replace(/\d+/, (n) => String(Number(n) + 1))} to replace it, and your name stays in the Hall of Fame forever. Keep it friendly:
        we remove anything rude, illegal or misleading.
      </p>
    </form>
  );
}
