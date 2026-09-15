"use client";

import { useState } from "react";

export default function ClaimPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/claim", {
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
      setMessage(data.error ?? "Something went wrong.");
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
        <form className="claim" onSubmit={handleSubmit}>
          <label>
            Plot size
            <select name="tier" required>
              <option value="kiosk">Kiosk — $5</option>
              <option value="shop">Shop front — $25</option>
              <option value="tower">Tower — $75</option>
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
          <button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Reserving..." : "Reserve this plot"}
          </button>
          {status === "error" && <p style={{ color: "#c6402f" }}>{message}</p>}
        </form>
      )}
    </main>
  );
}
