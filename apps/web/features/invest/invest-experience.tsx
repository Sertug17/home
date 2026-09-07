import { getAssetPresentation } from "@/config/asset-presentation";
import {
  cryptoAssets,
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
  cryptoMarket?: MarketDataState;
};

export function InvestExperience({
  stockMarket = unavailableMarketData,
  memeMarket = unavailableMarketData,
  cryptoMarket = unavailableMarketData,
}: InvestExperienceProps = {}) {
  return (
    <section className={styles.experience} aria-labelledby="invest-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Invest · read only</p>
          <h2 id="invest-title">Assets</h2>
        </div>
        <span>Prices shown only when sourced</span>
      </header>

      <section className={styles.section} aria-labelledby="invest-stocks-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>Stocks</p>
            <h3 id="invest-stocks-title">Tokenized stocks</h3>
          </div>
          <p>{stockAssets.length} assets</p>
        </div>

        <p className={styles.restrictionNote} role="note">
          Stock access is unavailable in the United States; country display does not change eligibility.
        </p>

        <AssetList assets={stockAssets} market={stockMarket} />

        <AssetDisclosure
          label="Stock contracts, eligibility, and sources"
          assets={stockAssets}
        >
          <p>
            Coinbase-issued Regulation S instruments are limited to eligible
            jurisdictions outside the US. Native company tickers are display
            labels; each Base token and its contract remain distinct. Home does
            not provide eligibility checks or trading.
          </p>
          <SourceLink
            href={investSources.stockRoster.url}
            label={investSources.stockRoster.label}
          />
          <SourceLink
            href={investSources.stockAnnouncement.url}
            label={investSources.stockAnnouncement.label}
          />
        </AssetDisclosure>
      </section>

      <section className={styles.section} aria-labelledby="invest-memes-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>Memes</p>
            <h3 id="invest-memes-title">Base memes</h3>
          </div>
          <p>{memeAssets.length} assets</p>
        </div>

        <AssetList assets={memeAssets} market={memeMarket} />

        <AssetDisclosure
          label="Meme contracts, risks, and sources"
          assets={memeAssets}
        >
          <p>
            Informational only, not an endorsement. Meme assets can be highly
            volatile; inclusion does not imply a route or eligibility.
          </p>
          {memeAssets.map((asset) =>
            asset.projectUrl ? (
              <SourceLink
                key={asset.id}
                href={asset.projectUrl}
                label={`${asset.displayName} project`}
              />
            ) : null,
          )}
        </AssetDisclosure>
      </section>

      <section className={styles.section} aria-labelledby="invest-crypto-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>Crypto</p>
            <h3 id="invest-crypto-title">Crypto majors on Base</h3>
          </div>
          <p>{cryptoAssets.length} assets</p>
        </div>

        <p className={styles.networkNote} role="note">
          Coinbase-wrapped ERC-20 tokens on Base, not native-network deposits.
          Use only the exact Base token and contract shown below.
        </p>

        <AssetList assets={cryptoAssets} market={cryptoMarket} />

        <AssetDisclosure
          label="Wrapped token contracts, backing, and source"
          assets={cryptoAssets}
        >
          <p>
            Coinbase describes these tokens as 1:1 representations of assets it
            holds. That backing statement does not create an exchange or
            redemption route in Home, and every displayed price is per wrapped
            token on Base.
          </p>
          <SourceLink
            href={investSources.coinbaseWrappedAssets.url}
            label={investSources.coinbaseWrappedAssets.label}
          />
        </AssetDisclosure>
      </section>
    </section>
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
        <span>Price snapshot</span>
      </div>
      <ul>
        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} market={market} />
        ))}
      </ul>
      {market.status === "ready" && market.snapshots.length === 0 ? (
        <p className={styles.emptyMarket} role="status">
          No price snapshots supplied.
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
  const presentation = getAssetPresentation(asset);

  return (
    <li className={styles.assetRow}>
      <div className={styles.identity}>
        <span className={styles.initials} aria-hidden="true">
          {asset.initials}
        </span>
        <span>
          <strong>{presentation.primaryName}</strong>
          <small>{presentation.primarySymbol}</small>
          <small className={styles.tokenIdentity}>
            {presentation.tokenLabel} · {presentation.networkLabel}
          </small>
        </span>
      </div>

      <div className={styles.price} data-tone={price.tone}>
        <strong>{price.value}</strong>
        <small>{presentation.priceUnitLabel}</small>
        <span>
          {price.sourceUrl ? (
            <SourceLink href={price.sourceUrl} label={price.detail} />
          ) : (
            price.detail
          )}
        </span>
      </div>
    </li>
  );
}

function AssetDisclosure({
  label,
  assets,
  children,
}: {
  label: string;
  assets: readonly InvestAsset[];
  children: React.ReactNode;
}) {
  return (
    <details className={styles.sources}>
      <summary>{label}</summary>
      <div className={styles.disclosureContent}>
        {children}
        <ul className={styles.contractList}>
          {assets.map((asset) => {
            const presentation = getAssetPresentation(asset);
            const decimals = asset.representation.decimals;

            return (
              <li key={asset.id}>
                <span>
                  {presentation.primarySymbol} display · {asset.representation.tokenSymbol} · {presentation.networkLabel}
                  {decimals === undefined ? "" : ` · ${decimals} decimals`}
                </span>
                <a href={asset.contractUrl} target="_blank" rel="noreferrer">
                  <code>{shortenContractAddress(asset.contractAddress)}</code>
                  <ExternalIcon />
                  <span className={styles.visuallyHidden}>
                    View {asset.representation.tokenSymbol} contract in a new tab
                  </span>
                </a>
                <small className={styles.relationship}>
                  {asset.representation.relationship}
                </small>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
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
