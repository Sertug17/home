import { AssetRow } from "@/components/finance-rows";
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
  assetActions?: (asset: InvestAsset) => React.ReactNode;
};

export function InvestExperience({
  stockMarket = unavailableMarketData,
  memeMarket = unavailableMarketData,
  cryptoMarket = unavailableMarketData,
  assetActions,
}: InvestExperienceProps = {}) {
  return (
    <section className={styles.experience} aria-labelledby="invest-title">
      <header className={styles.header}>
        <h2 id="invest-title">Assets</h2>
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

        <AssetList assets={stockAssets} market={stockMarket} assetActions={assetActions} />

        <AssetDisclosure
          label="Stock contracts, eligibility, and sources"
          assets={stockAssets}
        >
          <p>
            Available only in eligible jurisdictions outside the US. Company tickers are labels for distinct Base tokens; trading is disabled.
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

        <AssetList assets={memeAssets} market={memeMarket} assetActions={assetActions} />

        <AssetDisclosure
          label="Meme contracts, risks, and sources"
          assets={memeAssets}
        >
          <p>Highly volatile assets; inclusion is not an endorsement or an available trade route.</p>
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

        <AssetList assets={cryptoAssets} market={cryptoMarket} assetActions={assetActions} />

        <AssetDisclosure
          label="Wrapped token contracts, backing, and source"
          assets={cryptoAssets}
        >
          <p>
            Coinbase describes these as 1:1 asset representations. Prices are per wrapped Base token; exchange and redemption are unavailable here.
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
  assetActions,
}: {
  assets: readonly InvestAsset[];
  market: MarketDataState;
  assetActions?: (asset: InvestAsset) => React.ReactNode;
}) {
  return (
    <div className={styles.assetTable}>
      <div className={styles.tableHeading} aria-hidden="true">
        <span>Asset</span>
        <span>Price snapshot</span>
      </div>
      <div className={styles.assetEntries}>
        {assets.map((asset) => (
          <div className={styles.assetEntry} key={asset.id}>
            <ul aria-label={`${asset.displayName} market row`}>
              <InvestAssetRow asset={asset} market={market} />
            </ul>
            {assetActions?.(asset)}
          </div>
        ))}
      </div>
      {market.status === "ready" && market.snapshots.length === 0 ? (
        <p className={styles.emptyMarket} role="status">
          No price snapshots supplied.
        </p>
      ) : null}
    </div>
  );
}

function InvestAssetRow({
  asset,
  market,
}: {
  asset: InvestAsset;
  market: MarketDataState;
}) {
  const price = getMarketDisplay(asset.id, market);
  const presentation = getAssetPresentation(asset);
  const identity = `${presentation.primarySymbol} · ${presentation.tokenLabel} · ${presentation.networkLabel}`;
  const priceContext = `${presentation.priceUnitLabel} · ${price.detail}`;

  return (
    <AssetRow
      icon={asset.initials}
      iconTone="outlined"
      label={presentation.primaryName}
      context={identity}
      contextTitle={identity}
      value={price.value}
      valueContext={priceContext}
      valueContextTitle={priceContext}
      valueTone={
        price.tone === "ready"
          ? "accent"
          : price.tone === "error"
            ? "error"
            : "muted"
      }
      explorer={
        price.sourceUrl
          ? {
              href: price.sourceUrl,
              label: `Open ${price.detail} price source`,
              title: price.detail,
            }
          : undefined
      }
    />
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
