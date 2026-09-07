import type { MarketDataState } from "@/features/invest/invest-market";

export const MARKET_PRICES_VERSION = 1 as const;
export const MARKET_PRICE_FRESHNESS_MS = 5 * 60_000;

export type MarketPricesResponse = {
  version: typeof MARKET_PRICES_VERSION;
  provider: "codex";
  fetchedAt: string | null;
  unavailableReason?: "not-configured";
  markets: Readonly<Record<string, MarketDataState>>;
};
