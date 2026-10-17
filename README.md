# Plot Avenue

A "claim a plot" ad-billboard site — buy a building on the skyline, it
links to your website, permanently. Same stack as Aking Tindahan:
Next.js on Vercel + Supabase.

## 1. Supabase setup
The database lives in the shared Sprout Supabase project
(`dmfhvxrxkilszdrbghqh`), next to the `sprout_*` tables. It's already set up.

To rebuild it somewhere else: open the SQL editor, paste in
`supabase/schema.sql`, run it. It creates `plots`, `sales_log`, the three
order tables (`paymongo_orders`, `paypal_orders`, `crypto_orders`) and
their completion functions, and seeds 8 starter plots (kiosk $5, shop $25,
tower $75). Then grab the Project URL, anon key and service_role key from
Project Settings → API.

## 2. Local setup
```
npm install
cp .env.example .env.local
# paste in your Supabase keys
npm run dev
```

## 3. Deploy
Push to GitHub, import into Vercel, add the env vars from `.env.example`
in Vercel's Project Settings → Environment Variables. Deploy.

## How a purchase works (all payment methods)
1. Buyer picks a tier → the next open plot is **held** for them
   (PayMongo/crypto 60 min, PayPal 30 min) and an order row is created.
2. If they walk away, the hold simply expires and the plot is back on sale.
   Nothing gets stuck.
3. When the payment is confirmed (webhook or capture), a database function
   claims the plot and logs the sale in one step.
4. If the buyer pays *after* the hold ran out and someone else got the plot,
   the order is marked `needs_refund`. Check for these in the order tables
   and refund from that provider's dashboard.

## 4. Payments — PayMongo (wired up)
1. Sign up at dashboard.paymongo.com. Test mode needs no KYC.
2. Settings → Developers → copy your test secret key into
   `PAYMONGO_SECRET_KEY`.
3. Developers → Webhooks → Add Endpoint →
   `https://<your-domain>/api/webhook`, subscribe to
   `checkout_session.payment.paid`, copy the shown secret into
   `PAYMONGO_WEBHOOK_SECRET`. Orders are tracked in `paymongo_orders`.
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

## 6. Payments — Phantom / Solana + plot NFT
Buyers pay in SOL from Phantom and get an NFT (Metaplex Core) of their logo
in their wallet as proof they own the plot.

How it works: the buyer connects Phantom → the plot is held for 15 min and the
USD price is converted to SOL at the live rate → Phantom asks them to approve a
plain SOL transfer to your wallet → the server finds that payment on-chain by
the order's unique reference key (it never trusts the browser), checks the
amount, payer and destination, claims the plot, then mints the NFT straight
into the buyer's wallet. NFT metadata is served from `/api/nft/<plot id>`.

### Test on devnet first
1. In Phantom, make a **second account** called "Plot Avenue minter". Its
   private key goes on the server (Settings → Manage Accounts → that account
   → Show Private Key). Never use your main wallet for this.
2. Get free devnet SOL for the minter at faucet.solana.com (paste its address,
   choose devnet). 1 SOL mints ~250 NFTs.
3. In Vercel add: `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`,
   `SOLANA_TREASURY_ADDRESS=<your main Phantom address>`,
   `SOLANA_MINT_SECRET_KEY=<minter private key>`. Redeploy.
4. Turn on Phantom's Testnet Mode (Settings → Developer Settings) and buy a
   plot from a third wallet that has devnet SOL. You can't buy with the
   treasury wallet itself.
5. Optional: `node scripts/create-collection.mjs` (see the comment at the top)
   and set `SOLANA_COLLECTION_ADDRESS`, to group all plot NFTs together.

### Go live
Switch `NEXT_PUBLIC_SOLANA_CLUSTER` to `mainnet-beta`, put a little real SOL
in the minter wallet (~0.004 SOL per sale), ideally set `SOLANA_RPC_URL` to a
free Helius/QuickNode endpoint (the public one is rate-limited), and redeploy.
A devnet collection doesn't carry over, so re-run the collection script.

### If something goes wrong
- `solana_orders.status = needs_refund`: buyer paid but the plot was gone or
  the amount was wrong. Send their SOL back from Phantom.
- `nft_status = failed`: payment is fine, only the mint failed (usually the
  minter is out of SOL). Top it up, then retry with
  `POST /api/solana/confirm {"orderId": "<id>"}`.

