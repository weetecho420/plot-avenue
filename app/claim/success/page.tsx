export default function ClaimSuccessPage({
  searchParams,
}: {
  searchParams: { via?: string; nft?: string; cluster?: string };
}) {
  const nft = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(searchParams.nft ?? "") ? searchParams.nft : null;
  const cluster = searchParams.cluster === "mainnet-beta" ? "" : "?cluster=devnet";

  return (
    <main className="wrap">
      <div className="masthead">
        <h1>Payment received</h1>
      </div>
      <p>
        Thanks — your building is being added to the avenue. It may take a
        few seconds to appear on the skyline while we confirm the payment.
      </p>
      {searchParams.via === "card" && <p>Your card receipt is on its way to your email from Stripe.</p>}
      {searchParams.via === "solana" && (
        <div className="nft-proof">
          {nft ? (
            <p>
              Your plot NFT is in your Phantom wallet (Collectibles tab).{" "}
              <a href={`https://explorer.solana.com/address/${nft}${cluster}`} target="_blank" rel="noreferrer">
                View it on Solana Explorer
              </a>
            </p>
          ) : (
            <p>Your plot NFT is on its way to your Phantom wallet. If it doesn't show up within a few minutes, contact us.</p>
          )}
        </div>
      )}
      <a className="cta" href="/">Back to the avenue</a>
    </main>
  );
}
