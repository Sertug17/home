import { createBaseErc20TransferHistory } from "../apps/web/server/chain-data/base-erc20-transfers";
import {
  createCdpSqlAuthFromEnv,
  createCdpSqlHttpTransport,
} from "../apps/web/server/chain-data/cdp-sql-client";
import { ChainDataError } from "../apps/web/server/chain-data/errors";

if (process.env.CDP_SQL_SMOKE !== "1") {
  console.error(
    "Refusing network access. Set CDP_SQL_SMOKE=1 to run one bounded read-only query.",
  );
  process.exit(2);
}

const walletAddress = requiredEnv("CDP_SQL_SMOKE_WALLET_ADDRESS");
const assetId = requiredEnv("CDP_SQL_SMOKE_ASSET_ID");
const assetAddress = requiredEnv("CDP_SQL_SMOKE_ASSET_ADDRESS");
const now = new Date();
const from = new Date(now.getTime() - 60 * 60 * 1000);

try {
  const auth = createCdpSqlAuthFromEnv();
  const history = createBaseErc20TransferHistory({
    assets: [
      {
        id: assetId,
        chainId: 8453,
        address: assetAddress as `0x${string}`,
      },
    ],
    transport: createCdpSqlHttpTransport({
      auth,
      timeoutMs: 10_000,
    }),
  });
  const page = await history.listTransfers({
    verifiedWalletAddress: walletAddress,
    assetIds: [assetId],
    from: from.toISOString(),
    to: now.toISOString(),
    limit: 1,
    cacheMaxAgeMs: 900_000,
  });

  console.log(
    JSON.stringify({
      ok: true,
      authMode: auth.mode,
      cached: page.source.cached,
      stale: page.source.stale,
      executionTimestamp: page.source.executionTimestamp,
      executionTimeMs: page.source.executionTimeMs,
      returnedRows: page.transfers.length,
      hasMore: page.nextCursor !== null,
    }),
  );
} catch (error) {
  const failure =
    error instanceof ChainDataError
      ? {
          ok: false,
          code: error.code,
          status: error.status,
          retryAfterMs: error.retryAfterMs,
        }
      : { ok: false, code: "unknown", status: null, retryAfterMs: null };
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(JSON.stringify({ ok: false, code: "not-configured", field: name }));
    process.exit(2);
  }
  return value;
}
