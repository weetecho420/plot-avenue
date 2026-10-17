"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabasePublic } from "@/lib/supabase";
import PayPalButton from "./PayPalButton";
import PhantomButton from "./PhantomButton";

const TIER_NAME: Record<string, string> = {
  kiosk: "Kiosk",
  shop: "Shop front",
  tower: "Tower",
  skyscraper: "Skyscraper",
};

type Chosen = { slot: number; tier: string; price_cents: number };

export default function ClaimPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const getForm = useCallback(() => formRef.current, []);
  // The exact building tapped on the avenue (?slot=12), if it's still for sale.
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [slotNote, setSlotNote] = useState("");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("slot");
    const slot = raw === null ? NaN : Number(raw);
    if (!Number.isInteger(slot) || slot < 0) return;
    supabasePublic
      .from("plots")
      .select("slot_index, tier, price_cents, status")
      .eq("slot_index", slot)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.status === "available") {
          setChosen({ slot: data.slot_index, tier: data.tier, price_cents: data.price_cents });
        } else {
          setSlotNote(`Plot #${slot + 1} has already been claimed. Pick a size below and we'll give you the next open plot.`);
        }
      });
  }, []);

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
        slot: form.get("slot"),
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
          {chosen ? (
            <div className="chosen-plot">
              <input type="hidden" name="tier" value={chosen.tier} />
              <input type="hidden" name="slot" value={chosen.slot} />
              <p>
                You're claiming <b>plot #{chosen.slot + 1}</b>, a {TIER_NAME[chosen.tier]?.toLowerCase() ?? "plot"} for{" "}
                <b>${(chosen.price_cents / 100).toFixed(0)}</b>.
              </p>
              <button type="button" className="link-button" onClick={() => setChosen(null)}>
                Choose a size instead
              </button>
            </div>
          ) : (
            <label>
              Plot size
              {slotNote && <span className="slot-note">{slotNote}</span>}
              <select name="tier" required>
                <option value="kiosk">Kiosk — $5</option>
                <option value="shop">Shop front — $25</option>
                <option value="tower">Tower — $75</option>
                <option value="skyscraper">Skyscraper — $150</option>
              </select>
            </label>
          )}
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
          <PhantomButton getForm={getForm} />
          {status === "error" && <p style={{ color: "#c6402f" }}>{message}</p>}
          <PayPalButton getForm={getForm} />
        </form>
      )}
    </main>
  );
}
