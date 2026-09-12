import { describe, expect, test } from "bun:test";
import {
  PORTFOLIO_USDC_ADDRESS,
  portfolioVaults,
} from "@/config/portfolio-assets";
import {
  CODEX_RECOGNIZED_CATALOG_LIMIT,
  CODEX_RECOGNIZED_CATALOG_QUERY,
  CODEX_RECOGNIZED_OFFSETS,
  createCodexRecognizedTokenCatalogReader,
  normalizeRecognizedTokenCatalog,
} from "./recognized-catalog";

function row(
  address: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    liquidity: "1000000",
    volume24: "50000",
    token: {
      address,
      name: "Recognized",
      symbol: "RCG",
      decimals: "18",
      networkId: "8453",
      info: { imageSmallUrl: "https://images.example.test/token.png" },
    },
    ...overrides,
  };
}

function withToken(
  value: Record<string, unknown>,
  token: Record<string, unknown>,
): Record<string, unknown> {
  return { ...value, token: { ...(value.token as Record<string, unknown>), ...token } };
}

describe("Codex recognized-token catalog", () => {
  test("queries exactly the three Jesse-locked public pages and coalesces the cached catalog", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reader = createCodexRecognizedTokenCatalogReader({
      apiKey: "fixture-key",
      now: () => new Date("2026-09-12T12:00:00.000Z"),
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push(body);
        await gate;
        const variables = body.variables as { offset: number };
        return Response.json({
          data: {
            filterTokens: {
              results: variables.offset === 0
                ? [row("0x1111111111111111111111111111111111111111")]
                : [],
              count: variables.offset === 0 ? 1 : 0,
              page: variables.offset,
            },
          },
        });
      },
    });

    const first = reader();
    const second = reader();
    release();
    expect(await first).toEqual(await second);
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => (call.variables as { offset: number }).offset).sort((a, b) => a - b)).toEqual([...CODEX_RECOGNIZED_OFFSETS]);
    for (const call of calls) {
      expect(call.query).toBe(CODEX_RECOGNIZED_CATALOG_QUERY);
      expect(call.variables).toMatchObject({
        filters: { network: [8453], potentialScam: false, trendingIgnored: false },
        rankings: [{ attribute: "liquidity", direction: "DESC" }],
        limit: 200,
      });
      expect(JSON.stringify(call.variables)).not.toContain("wallet");
    }
    expect(await reader()).toMatchObject({
      status: "complete",
      entries: [{ address: "0x1111111111111111111111111111111111111111" }],
    });
    expect(calls).toHaveLength(3);
  });

  test("preserves successful catalog pages when one page fails", async () => {
    const reader = createCodexRecognizedTokenCatalogReader({
      apiKey: "fixture-key",
      fetchImpl: async (_input, init) => {
        const { variables } = JSON.parse(String(init?.body)) as {
          variables: { offset: number };
        };
        if (variables.offset === 200) throw new Error("page unavailable");
        const results = variables.offset === 0
          ? [row("0x1111111111111111111111111111111111111111")]
          : [withToken(row("0x2222222222222222222222222222222222222222"), { symbol: "TWO" })];
        return Response.json({
          data: {
            filterTokens: {
              results,
              count: results.length,
              page: variables.offset,
            },
          },
        });
      },
    });

    const result = await reader();
    expect(result.status).toBe("incomplete");
    expect(result.entries.map(({ address }) => address)).toEqual([
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ]);
  });

  test("validates, sanitizes, deduplicates, excludes configured identities, and caps in liquidity order", () => {
    const valid = row("0x1111111111111111111111111111111111111111");
    const cases = [
      valid,
      row("0x1111111111111111111111111111111111111111"),
      row(PORTFOLIO_USDC_ADDRESS),
      row(portfolioVaults[0].address),
      row("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
      withToken(row("0x2222222222222222222222222222222222222222"), { symbol: "ETH" }),
      withToken(row("0x3333333333333333333333333333333333333333"), { decimals: "256" }),
      withToken(row("0x4444444444444444444444444444444444444444"), { networkId: "1" }),
      row("0x5555555555555555555555555555555555555555", { liquidity: "0" }),
      row("0x6666666666666666666666666666666666666666", { volume24: "invalid" }),
      withToken(row("0x7777777777777777777777777777777777777777"), {
        symbol: "SAFE",
        info: { imageSmallUrl: "http://unsafe.example.test/token.png" },
      }),
    ];
    const filler = Array.from({ length: CODEX_RECOGNIZED_CATALOG_LIMIT + 2 }, (_, index) =>
      withToken(
        row(`0x${(index + 100).toString(16).padStart(40, "0")}`),
        { symbol: `R${index}` },
      ),
    );

    const normalized = normalizeRecognizedTokenCatalog([...cases, ...filler]);
    expect(normalized).toHaveLength(CODEX_RECOGNIZED_CATALOG_LIMIT);
    expect(normalized[0]).toMatchObject({
      address: "0x1111111111111111111111111111111111111111",
      name: "Recognized",
      symbol: "RCG",
      decimals: 18,
      liquidityUsd: { atoms: "1000000", scale: 0 },
      volume24Usd: { atoms: "50000", scale: 0 },
      imageUrl: "https://images.example.test/token.png",
    });
    expect(normalized[1]).toMatchObject({
      address: "0x7777777777777777777777777777777777777777",
      symbol: "SAFE",
    });
    expect(normalized[1]).not.toHaveProperty("imageUrl");
    expect(new Set(normalized.map(({ address }) => address)).size).toBe(normalized.length);
  });
});
