import { describe, expect, test } from "bun:test";
import { createCdpTradeQuoteClient } from "./cdp";

const FROM = "0x1111111111111111111111111111111111111111" as const;
const TO = "0x2222222222222222222222222222222222222222" as const;
const TAKER = "0x3333333333333333333333333333333333333333" as const;
const SIGNER = "0x4444444444444444444444444444444444444444" as const;
const HASH = `0x${"55".repeat(32)}` as const;

describe("primary CDP trade quote adapter", () => {
  test("uses the fixed authenticated REST endpoint and preserves provider Permit2 hash", async () => {
    let jwtOptions: unknown;
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const client = await createCdpTradeQuoteClient({
      env: { CDP_API_KEY_ID: "key-id", CDP_API_KEY_SECRET: "key-secret" },
      generateJwtImpl: async (options) => { jwtOptions = options; return "server-jwt"; },
      fetchImpl: (async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return Response.json({
          liquidityAvailable: true,
          fromToken: FROM,
          toToken: TO,
          fromAmount: "100",
          toAmount: "90",
          minToAmount: "89",
          blockNumber: "123",
          fees: { gasFee: null, protocolFee: null },
          issues: { allowance: null, balance: null, simulationIncomplete: false },
          transaction: { to: TO, data: "0x1234", value: "0", gas: "100000", gasPrice: "1" },
          permit2: { hash: HASH, eip712: { primaryType: "PermitTransferFrom" } },
        });
      }) as typeof fetch,
    });
    const quote = await client.createSwapQuote({
      network: "base", fromToken: FROM, toToken: TO, fromAmount: BigInt(100),
      taker: TAKER, signerAddress: SIGNER, slippageBps: 100, idempotencyKey: "quote-id",
    });
    expect(jwtOptions).toMatchObject({
      requestMethod: "POST",
      requestHost: "api.cdp.coinbase.com",
      requestPath: "/platform/v2/evm/swaps",
    });
    expect(requestedUrl).toBe("https://api.cdp.coinbase.com/platform/v2/evm/swaps");
    expect(requestedInit?.headers).toMatchObject({
      Authorization: "Bearer server-jwt",
      "X-Idempotency-Key": "quote-id",
    });
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      network: "base",
      fromToken: FROM,
      toToken: TO,
      fromAmount: "100",
      taker: TAKER,
      signerAddress: SIGNER,
      slippageBps: 100,
    });
    expect(quote.liquidityAvailable && quote.permit2?.hash).toBe(HASH);
  });
});
