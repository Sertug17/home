import { describe, expect, test } from "bun:test";
import { PORTFOLIO_USDC_ASSET_KEY } from "@/config/portfolio-assets";
import { createCodexRawQuotesReader } from "./raw-quotes";

const ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const NOW = "2026-09-08T12:00:00.000Z";
const NOW_SECONDS = String(Date.parse(NOW) / 1_000);
const input = {
  assetKey: PORTFOLIO_USDC_ASSET_KEY,
  address: ADDRESS,
  networkId: 8453 as const,
};

describe("Codex raw quotes", () => {
  test("retains the exact raw decimal and exact contract/time provenance", async () => {
    const reader = createCodexRawQuotesReader({
      apiKey: "fixture-key",
      inputs: [input],
      now: () => new Date(NOW),
      fetchImpl: (async () =>
        new Response(
          `{"data":{"getTokenPrices":[{"address":"${ADDRESS}","networkId":8453,"priceUsd":1.0000000000000000001,"timestamp":${NOW_SECONDS}}]}}`,
        )),
    });

    expect(await reader()).toEqual([
      expect.objectContaining({
        assetKey: PORTFOLIO_USDC_ASSET_KEY,
        sourceValue: "1.0000000000000000001",
        unitPrice: { atoms: "10000000000000000001", scale: 19 },
        status: "fresh",
        source: expect.objectContaining({
          asOf: NOW,
          timeBasis: "provider-as-of",
        }),
      }),
    ]);
  });

  test("re-evaluates source age on cache hits without changing provenance", async () => {
    let nowMs = Date.parse(NOW);
    let calls = 0;
    const asOfSeconds = String(nowMs / 1_000 - 299);
    const reader = createCodexRawQuotesReader({
      apiKey: "fixture-key",
      inputs: [input],
      now: () => new Date(nowMs),
      fetchImpl: (async () => {
        calls += 1;
        return new Response(
          `{"data":{"getTokenPrices":[{"address":"${ADDRESS}","networkId":8453,"priceUsd":1,"timestamp":${asOfSeconds}}]}}`,
        );
      }),
    });

    const fresh = await reader();
    const source = fresh[0]?.source;
    expect(fresh[0]?.status).toBe("fresh");
    nowMs += 2_000;
    const stale = await reader();
    expect(calls).toBe(1);
    expect(stale[0]?.status).toBe("stale");
    expect(stale[0]?.unitPrice).toBeNull();
    expect(stale[0]?.source).toEqual(source);
  });

  test("evaluates source age at fetch completion before caching", async () => {
    let nowMs = Date.parse(NOW);
    let resolveResponse!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const asOfSeconds = String(nowMs / 1_000 - 299);
    const reader = createCodexRawQuotesReader({
      apiKey: "fixture-key",
      inputs: [input],
      now: () => new Date(nowMs),
      fetchImpl: async () => pendingResponse,
    });

    const pending = reader();
    nowMs += 2_000;
    resolveResponse(
      new Response(
        `{"data":{"getTokenPrices":[{"address":"${ADDRESS}","networkId":8453,"priceUsd":1,"timestamp":${asOfSeconds}}]}}`,
      ),
    );
    const result = await pending;
    expect(result[0]?.status).toBe("stale");
    expect(result[0]?.unitPrice).toBeNull();
    expect(result[0]?.source).toMatchObject({
      fetchedAt: NOW,
      asOf: new Date(Number(asOfSeconds) * 1_000).toISOString(),
    });
  });

  test("marks stale and duplicate exact-contract records unavailable rather than choosing one", async () => {
    const stale = String(Number(NOW_SECONDS) - 301);
    const row = `{"address":"${ADDRESS}","networkId":8453,"priceUsd":1,"timestamp":${stale}}`;
    const staleResult = await createCodexRawQuotesReader({
      apiKey: "fixture-key",
      inputs: [input],
      now: () => new Date(NOW),
      fetchImpl: (async () =>
        new Response(`{"data":{"getTokenPrices":[${row}]}}`)),
    })();
    expect(staleResult[0]?.status).toBe("stale");
    expect(staleResult[0]?.unitPrice).toBeNull();

    const duplicate = await createCodexRawQuotesReader({
      apiKey: "fixture-key",
      inputs: [input],
      now: () => new Date(NOW),
      fetchImpl: (async () =>
        new Response(`{"data":{"getTokenPrices":[${row},${row}]}}`)),
    })();
    expect(duplicate[0]?.status).toBe("invalid");
    expect(duplicate[0]?.unitPrice).toBeNull();
  });
});
