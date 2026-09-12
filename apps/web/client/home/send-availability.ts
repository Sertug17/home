import { PORTFOLIO_NATIVE_ASSET_KEY } from "@/config/portfolio-assets";
import type { HomeAssetBalanceItem } from "./home-types";

export type SendAvailability = Partial<Record<"usdc" | "eth", string>>;

export function deriveSendAvailability(
  items: readonly HomeAssetBalanceItem[],
): SendAvailability {
  const availableItems = items.filter(
    (item) => item.tone !== "error" && item.displayBalance !== "—",
  );
  const cashUsd = availableItems.find(
    (item) => item.group === "cash" && item.currencyCode === "USD",
  );
  const eth = availableItems.find(
    (item) => item.assetKey === PORTFOLIO_NATIVE_ASSET_KEY,
  );
  return {
    ...(cashUsd?.displayBalance ? { usdc: cashUsd.displayBalance } : {}),
    ...(eth ? { eth: eth.displayContext ?? eth.displayBalance } : {}),
  };
}
