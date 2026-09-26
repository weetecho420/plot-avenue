"use client";

import { useCallback, useRef, useState } from "react";
import PayPalButton from "./PayPalButton";

export default function ClaimPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const getForm = useCallback(() => formRef.current, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = new FormData(e.currentTarget);
    // Which button was pressed: PayMongo (GCash/card) or crypto.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const endpoint = submitter?.value === "crypto" ? "/api/crypto-checkout" : "/api/claim";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: form.get("tier"),
        owner_name: form.get("owner_name"),
        website_url: form.get("website_url"),
        logo_url: form.get("logo_url"),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus("error");
      setMessage(`${data.error ?? "Something went wrong."} ${data.detail ?? ""}`);
      return;
    }
    // Send the buyer to PayMongo's hosted checkout page.
    setStatus("done");
    window.location.href = data.checkoutUrl;
  }

  return (
    <main className="wrap">
      <div className="masthead">
        <h1>Claim a plot</h1>
      </div>

      {status === "done" ? (
        <p>Redirecting to payment...</p>
      ) : (
        <form className="claim" onSubmit={handleSubmit} ref={formRef}>
          <label>
            Plot size
            <select name="tier" required>
              <option value="kiosk">Kiosk — $5</option>
              <option value="shop">Shop front — $25</option>
              <option value="tower">Tower — $75</option>
              <option value="skyscraper">Skyscraper — $150</option>
            </select>
          </label>
          <label>
            Business or site name
            <input name="owner_name" required maxLength={40} />
          </label>
          <label>
            Website URL
            <input name="website_url" type="url" required placeholder="https://" />
          </label>
          <label>
            Logo image URL
            <input name="logo_url" type="url" placeholder="https://" />
          </label>
          <button type="submit" name="pay" value="paymongo" disabled={status === "submitting"}>
            {status === "submitting" ? "Reserving..." : "Pay with GCash / card (charged in ₱)"}
          </button>
          <button type="submit" name="pay" value="crypto" className="crypto" disabled={status === "submitting"}>
            Pay with crypto (BTC · ETH · SOL · USDT · USDC)
          </button>
          {status === "error" && <p style={{ color: "#c6402f" }}>{message}</p>}
          <PayPalButton getForm={getForm} />
        </form>
      )}
    </main>
  );
}
