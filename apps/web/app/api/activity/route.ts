import { isBaseAccountEnabled } from "@/features/account/session-types";
import { createActivityHandler } from "@/server/activity/handler";
import { getCdpAccessTokenValidator } from "@/server/cdp/provider";
import { createSessionHandler } from "@/server/cdp/session";
import { createBaseErc20TransferHistory } from "@/server/chain-data/base-erc20-transfers";
import {
  createCdpSqlAuthFromEnv,
  createCdpSqlHttpTransport,
} from "@/server/chain-data/cdp-sql-client";
import { BASE_USDC_ADDRESS } from "@/server/portfolio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authorizeSession = createSessionHandler({
  getValidator: getCdpAccessTokenValidator,
  baseAccountEnabled: isBaseAccountEnabled(
    process.env.NEXT_PUBLIC_ENABLE_BASE_ACCOUNT,
  ),
});

export const GET = createActivityHandler({
  authorize: authorizeSession,
  async readActivity(account) {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const history = createBaseErc20TransferHistory({
      assets: [
        {
          id: "usdc",
          chainId: 8453,
          address: BASE_USDC_ADDRESS,
        },
      ],
      transport: createCdpSqlHttpTransport({
        auth: createCdpSqlAuthFromEnv(),
      }),
      now: () => now,
    });

    return history.listTransfers({
      verifiedWalletAddress: account.address,
      assetIds: ["usdc"],
      from: from.toISOString(),
      to: now.toISOString(),
      limit: 20,
      cacheMaxAgeMs: 30_000,
      staleAfterMs: 60_000,
    });
  },
});
