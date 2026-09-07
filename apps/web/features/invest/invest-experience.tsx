import {
  investSources,
  memeAssets,
  shortenContractAddress,
  stockAssets,
  type InvestAsset,
} from "@/config/invest-assets";
import {
  getMarketDisplay,
  unavailableMarketData,
  type MarketDataState,
} from "./invest-market";
import styles from "./invest-experience.module.css";

export type InvestExperienceProps = {
  stockMarket?: MarketDataState;
  memeMarket?: MarketDataState;
};

export function InvestExperience({
  stockMarket = unavailableMarketData,
  memeMarket = unavailableMarketData,
}: InvestExperienceProps = {}) {
  return (
    <div className={styles.experience}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Invest · read only</p>
          <h2>Know what you are looking at.</h2>
        </div>
        <p className={styles.introCopy}>
          A concise view of verified Base contract identities. Prices and
          trading stay unavailable until a caller supplies sourced market data
          and a separate execution route is reviewed.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="invest-stocks-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>01 / Stocks</p>
            <h3 id="invest-stocks-title">Tokenized stocks</h3>
          </div>
          <p>{stockAssets.length} verified contracts on Base</p>
        </div>

        <div className={styles.restrictionNote} role="note">
          <strong>Unavailable in the United States.</strong>
          <span>
            Coinbase-issued Regulation S instruments are limited to eligible
            jurisdictions outside the US. Country selection does not unlock
            access.
          </span>
        </div>

        <AssetList assets={stockAssets} market={stockMarket} />

        <details className={styles.sources}>
          <summary>Stock sources and status</summary>
          <div>
            <p>
              Contract identities come from the official Base roster. Home
              does not currently provide quotes, eligibility checks, or
              trading.
            </p>
            <SourceLink
              href={investSources.stockRoster.url}
              label={investSources.stockRoster.label}
            />
            <SourceLink
              href={investSources.stockAnnouncement.url}
              label={investSources.stockAnnouncement.label}
            />
          </div>
        </details>
      </section>

      <section className={styles.section} aria-labelledby="invest-memes-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>02 / Memes</p>
            <h3 id="invest-memes-title">Base-native corner</h3>
          </div>
          <p>{memeAssets.length} curated identities</p>
        </div>

        <p className={styles.sectionCopy}>
          A small informational set, not an endorsement. Meme assets are
          volatile; no route or eligibility is implied by inclusion.
        </p>

        <AssetList assets={memeAssets} market={memeMarket} />

        <details className={styles.sources}>
          <summary>Meme sources and status</summary>
          <div>
            <p>
              Each entry links to its primary project site and verified Base
              explorer contract. Home does not provide a quote or trade action.
            </p>
            {memeAssets.map((asset) => (
              <span className={styles.sourceGroup} key={asset.id}>
                {asset.projectUrl ? (
                  <SourceLink href={asset.projectUrl} label={`${asset.name} project`} />
                ) : null}
                <SourceLink href={asset.contractUrl} label={`${asset.symbol} contract`} />
              </span>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}

function AssetList({
  assets,
  market,
}: {
  assets: readonly InvestAsset[];
  market: MarketDataState;
}) {
  return (
    <div className={styles.assetTable}>
      <div className={styles.tableHeading} aria-hidden="true">
        <span>Asset</span>
        <span>Contract</span>
        <span>Price</span>
      </div>
      <ul>
        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} market={market} />
        ))}
      </ul>
      {market.status === "ready" && market.snapshots.length === 0 ? (
        <p className={styles.emptyMarket} role="status">
          No market snapshots were supplied. Verified identities remain
          visible without prices.
        </p>
      ) : null}
    </div>
  );
}

function AssetRow({
  asset,
  market,
}: {
  asset: InvestAsset;
  market: MarketDataState;
}) {
  const price = getMarketDisplay(asset.id, market);

  return (
    <li className={styles.assetRow}>
      <div className={styles.identity}>
        <span className={styles.initials} aria-hidden="true">
          {asset.initials}
        </span>
        <span>
          <strong>{asset.name}</strong>
          <small>
            {asset.symbol} · {asset.descriptor}
          </small>
        </span>
      </div>

      <div className={styles.contract}>
        <span>Base · {asset.chainId}</span>
        <a href={asset.contractUrl} target="_blank" rel="noreferrer">
          <code>{shortenContractAddress(asset.contractAddress)}</code>
          <ExternalIcon />
          <span className={styles.visuallyHidden}>
            View {asset.symbol} contract in a new tab
          </span>
        </a>
      </div>

      <div className={styles.price} data-tone={price.tone}>
        <strong>{price.value}</strong>
        {price.sourceUrl ? (
          <a href={price.sourceUrl} target="_blank" rel="noreferrer">
            {price.detail}
            <span className={styles.visuallyHidden}> in a new tab</span>
          </a>
        ) : (
          <span>{price.detail}</span>
        )}
      </div>
    </li>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a className={styles.sourceLink} href={href} target="_blank" rel="noreferrer">
      {label}
      <ExternalIcon />
      <span className={styles.visuallyHidden}> opens in a new tab</span>
    </a>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 3h6v6M11 3 4 10" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
