# Plot Avenue

A "claim a plot" ad-billboard site — buy a building on the skyline, it
links to your website, permanently. Same stack as Aking Tindahan:
Next.js on Vercel + Supabase.

## 1. Supabase setup
1. Create a new Supabase project.
2. Open the SQL editor, paste in `supabase/schema.sql`, run it.
   This creates the `plots` and `sales_log` tables and seeds 8 starter
   plots across three tiers (kiosk $5, shop $25, tower $75).
3. Grab your Project URL, anon key, and service_role key from
   Project Settings → API.

## 2. Local setup
```
npm install
cp .env.example .env.local
# paste in your Supabase keys
npm run dev
```

## 3. Deploy
Push to GitHub, import into Vercel, add the same three env vars in
Vercel's Project Settings → Environment Variables. Deploy.

## 4. Payments — PayMongo (wired up)
1. Sign up at dashboard.paymongo.com. Test mode needs no KYC.
2. Settings → Developers → copy your test secret key into
   `PAYMONGO_SECRET_KEY`.
3. Developers → Webhooks → Add Endpoint →
   `https://<your-domain>/api/webhook`, subscribe to
   `checkout_session.payment.paid`, copy the shown secret into
   `PAYMONGO_WEBHOOK_SECRET`.
4. Set `NEXT_PUBLIC_SITE_URL` to your real deployed URL (Vercel gives
   you one automatically, or use your custom domain).
5. Test the flow: claim a plot → you're redirected to PayMongo's
   hosted checkout → pay with a PayMongo test card (4343 4343 4343
   4345, any future expiry/CVC) or the GCash test flow → you land on
   `/claim/success` → the webhook fires → the plot flips to "claimed"
   on the skyline within a few seconds.
6. Once you're ready to take real money: complete KYC in the PayMongo
   dashboard, switch `PAYMONGO_SECRET_KEY` and
   `PAYMONGO_WEBHOOK_SECRET` to your live keys, and re-register the
   webhook endpoint in live mode.

## 5. Editing the skyline
- Add/remove plots by inserting rows into `plots` in Supabase directly,
  or build a small admin page later (same PIN-login pattern you used
  in Aking Tindahan would work well here).
- Building height per tier is set in `app/page.tsx` in `TIER_HEIGHT`.
- Colors, fonts, and layout live in `app/globals.css`.
