"use client";

import type { InvestAsset } from "@/config/invest-assets";
import {
  presentInvestAssetMark,
  type AssetMarkResolution,
} from "@/client/asset-mark/presentation";
import type { MarketDataState } from "@/shared/invest/invest-market";
import { moneyChangeTone } from "@/shared/formatting";
import { useMarketDisplay } from "./use-market-display";
import { AssetIcon } from "./asset-icon";
import styles from "./invest-experience.module.css";

export function DiscoverAssetRow({
  asset,
  market,
  assetMarkResolution = {},
  onOpen,
}: {
  asset: InvestAsset;
  market: MarketDataState;
  assetMarkResolution?: AssetMarkResolution;
  onOpen: () => void;
}) {
  const price = useMarketDisplay(asset.id, market);
  const mark = presentInvestAssetMark(asset, assetMarkResolution);
  const change = price.changeLabel ?? "—";
  const changeTone = moneyChangeTone(change);

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={onOpen}
        aria-label={`${asset.displayName} details`}
      >
        <AssetIcon mark={mark} />
        <span className={styles.identity}>
          <strong>{asset.displayName}</strong>
          <small>{asset.displaySymbol}</small>
        </span>
        <span className={styles.quote}>
          <strong>{price.value}</strong>
          {change !== "—" ? (
            <small className={styles.change} data-money-change={changeTone}>{change}</small>
          ) : null}
        </span>
      </button>
    </li>
  );
}
