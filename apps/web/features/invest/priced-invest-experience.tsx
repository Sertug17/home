"use client";

import { TradeActions } from "@/features/trading/trade-actions";
import { InvestExperience } from "./invest-experience";
import { useMarketPrices } from "./use-market-prices";

export function PricedInvestExperience() {
  const marketProps = useMarketPrices();
  return (
    <InvestExperience
      {...marketProps}
      assetActions={(asset) => <TradeActions asset={asset} />}
    />
  );
}
