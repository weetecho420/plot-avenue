// One-time (optional): create the "Plot Avenue" NFT collection so every plot
// NFT is grouped together in wallets.
//
//   SOLANA_MINT_SECRET_KEY=... NEXT_PUBLIC_SOLANA_CLUSTER=devnet NEXT_PUBLIC_SITE_URL=https://plot-avenue.vercel.app \
//     node scripts/create-collection.mjs
//
// Then put the printed address in Vercel as SOLANA_COLLECTION_ADDRESS.
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, generateSigner, signerIdentity } from "@metaplex-foundation/umi";
import { createCollection, mplCore } from "@metaplex-foundation/mpl-core";
import bs58 from "bs58";

const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
const rpc = process.env.SOLANA_RPC_URL || `https://api.${cluster}.solana.com`;
const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const raw = (process.env.SOLANA_MINT_SECRET_KEY || "").trim();
if (!raw || !site) throw new Error("Set SOLANA_MINT_SECRET_KEY and NEXT_PUBLIC_SITE_URL");

const umi = createUmi(rpc, "confirmed").use(mplCore());
const secret = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
umi.use(signerIdentity(createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(secret))));

const collection = generateSigner(umi);
await createCollection(umi, {
  collection,
  name: "Plot Avenue",
  uri: `${site}/api/nft/collection`,
}).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

console.log(`Created on ${cluster}. SOLANA_COLLECTION_ADDRESS=${collection.publicKey}`);
