import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, generateSigner, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { create, fetchCollection, mplCore } from "@metaplex-foundation/mpl-core";
import bs58 from "bs58";
import { rpcUrl } from "@/lib/solana";

// Server-only. Mints a Metaplex Core NFT ("asset") straight into the buyer's
// wallet. The image is the buyer's logo; the metadata lives on our own site
// at /api/nft/<plot id>. The mint wallet (SOLANA_MINT_SECRET_KEY) pays the
// small network + storage cost (~0.003 SOL per NFT), so keep a little SOL in it.

export const TIER_NAME: Record<string, string> = {
  kiosk: "Kiosk",
  shop: "Shop Front",
  tower: "Tower",
  skyscraper: "Skyscraper",
};

// Accepts the secret key as base58 (Phantom "export private key") or as a
// JSON number array (solana-keygen file contents).
export function mintSecretKey(): Uint8Array {
  const raw = (process.env.SOLANA_MINT_SECRET_KEY ?? "").trim();
  if (!raw) throw new Error("SOLANA_MINT_SECRET_KEY is not set");
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  if (bytes.length !== 64) throw new Error("SOLANA_MINT_SECRET_KEY must be a 64-byte secret key");
  return bytes;
}

function umiWithMintWallet() {
  const umi = createUmi(rpcUrl(), "confirmed").use(mplCore());
  const kp = umi.eddsa.createKeypairFromSecretKey(mintSecretKey());
  umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
  return umi;
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export async function mintPlotNft(opts: {
  plotId: string;
  slotIndex: number;
  tier: string;
  ownerName: string;
  ownerWallet: string;
}): Promise<string> {
  const umi = umiWithMintWallet();
  const asset = generateSigner(umi);

  // Optional: group every plot NFT under one "Plot Avenue" collection in wallets.
  const collectionAddress = process.env.SOLANA_COLLECTION_ADDRESS;
  const collection = collectionAddress ? await fetchCollection(umi, publicKey(collectionAddress)) : undefined;

  const name = `Plot Avenue #${opts.slotIndex + 1} · ${TIER_NAME[opts.tier] ?? "Plot"}`.slice(0, 32);

  await create(umi, {
    asset,
    collection,
    name,
    uri: `${siteUrl()}/api/nft/${opts.plotId}`,
    owner: publicKey(opts.ownerWallet),
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  return asset.publicKey.toString();
}
