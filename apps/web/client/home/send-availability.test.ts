import { describe, expect, test } from "bun:test";
import { PORTFOLIO_NATIVE_ASSET_KEY } from "@/config/portfolio-assets";
import type { HomeAssetBalanceItem } from "./home-types";
import { deriveSendAvailability } from "./send-availability";

const cases: Array<{
  name: string;
  items: HomeAssetBalanceItem[];
  expected: ReturnType<typeof deriveSendAvailability>;
}> = [
  {
    name: "uses canonical USD cash and native ETH",
    items: [
      { id: "usd", group: "cash", name: "US dollar", currencyCode: "USD", displayBalance: "12.34" },
      { id: "eth", assetKey: PORTFOLIO_NATIVE_ASSET_KEY, group: "asset", name: "Ethereum", displayBalance: "$20", displayContext: "0.01 ETH" },
    ],
    expected: { usdc: "12.34", eth: "0.01 ETH" },
  },
  {
    name: "never substitutes non-USD cash for USDC",
    items: [
      { id: "eur", group: "cash", name: "Euro", currencyCode: "EUR", displayBalance: "1234.56" },
      { id: "idr", group: "cash", name: "Rupiah", currencyCode: "IDR", displayBalance: "1000.00" },
    ],
    expected: {},
  },
  {
    name: "excludes unavailable and non-canonical assets",
    items: [
      { id: "usd", group: "cash", name: "US dollar", currencyCode: "USD", displayBalance: "—" },
      { id: "eth-label", group: "asset", name: "Ethereum", detail: "ETH", displayBalance: "1 ETH" },
      { id: "errored", assetKey: PORTFOLIO_NATIVE_ASSET_KEY, group: "asset", name: "Ethereum", displayBalance: "1 ETH", tone: "error" },
    ],
    expected: {},
  },
];

describe("deriveSendAvailability", () => {
  for (const entry of cases) {
    test(entry.name, () => {
      expect(deriveSendAvailability(entry.items)).toEqual(entry.expected);
    });
  }
});
