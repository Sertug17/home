import {
  createErrorMarketPricesResponse,
  getCodexMarketPrices,
} from "@/server/market-data/codex/client";
import type { MarketPricesResponse } from "@/server/market-data/codex/public-contract";

type MarketPricesReader = () => Promise<MarketPricesResponse>;

export function createMarketPricesHandler(
  readMarketPrices: MarketPricesReader = getCodexMarketPrices,
) {
  return async function GET() {
    try {
      const payload = await readMarketPrices();
      const cacheControl = payload.unavailableReason
        ? "public, max-age=30"
        : "public, max-age=30, stale-while-revalidate=30";
      return Response.json(payload, {
        headers: { "Cache-Control": cacheControl },
      });
    } catch {
      return Response.json(createErrorMarketPricesResponse(), {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
  };
}
