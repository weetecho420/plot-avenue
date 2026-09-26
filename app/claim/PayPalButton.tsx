"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Returns the claim form, or null if it's not ready.
  getForm: () => HTMLFormElement | null;
};

declare global {
  interface Window {
    paypal?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

export default function PayPalButton({ getForm }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!CLIENT_ID || !box.current) return;
    let cancelled = false;

    function render() {
      if (cancelled || !window.paypal || !box.current) return;
      box.current.innerHTML = "";

      const formValues = () => {
        const form = getForm();
        const f = form ? new FormData(form) : new FormData();
        return {
          tier: f.get("tier"),
          owner_name: f.get("owner_name"),
          website_url: f.get("website_url"),
          logo_url: f.get("logo_url"),
        };
      };

      window.paypal
        .Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

          // Don't open PayPal until the name and website are filled in.
          onClick: (_data: unknown, actions: any) => {
            const form = getForm();
            if (form && !form.reportValidity()) return actions.reject();
            setMessage("");
            return actions.resolve();
          },

          createOrder: async () => {
            const r = await fetch("/api/paypal/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(formValues()),
            });
            const data = await r.json();
            if (!r.ok) {
              setMessage(data.error ?? "Could not start PayPal checkout.");
              throw new Error(data.error);
            }
            return data.id;
          },

          onApprove: async (data: { orderID: string }, actions: any) => {
            const r = await fetch("/api/paypal/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: data.orderID }),
            });
            const out = await r.json();
            if (out.retry) return actions.restart(); // card declined: try another
            if (out.result === "ok") {
              window.location.href = "/claim/success";
              return;
            }
            if (out.result === "pending") {
              setMessage("Thanks! PayPal is still processing your payment. Your building appears once it clears.");
              return;
            }
            setMessage(out.error ?? "Payment failed.");
          },

          onCancel: (data: { orderID: string }) => {
            fetch("/api/paypal/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: data.orderID }),
            });
          },

          onError: () => {
            setMessage((m) => m || "PayPal had a problem. Please try again.");
          },
        })
        .render(box.current);
    }

    if (window.paypal) {
      render();
    } else {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=USD&intent=capture`;
      s.async = true;
      s.onload = render;
      document.body.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [getForm]);

  if (!CLIENT_ID) return null;

  return (
    <div className="paypal-box">
      <div className="paypal-or">or pay with PayPal / card (USD)</div>
      <div ref={box} />
      {message && <p style={{ color: "#c6402f" }}>{message}</p>}
    </div>
  );
}
