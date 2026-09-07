import { createCdpSqlAuthFromEnv } from "../apps/web/server/chain-data/cdp-sql-client";
import { ChainDataError } from "../apps/web/server/chain-data/errors";

try {
  const auth = createCdpSqlAuthFromEnv();
  console.log(
    JSON.stringify({
      configured: true,
      authMode: auth.mode,
      networkRequestMade: false,
    }),
  );
} catch (error) {
  const code = error instanceof ChainDataError ? error.code : "unknown";
  console.log(
    JSON.stringify({
      configured: false,
      authMode: null,
      networkRequestMade: false,
      code,
    }),
  );
  process.exitCode = 1;
}
