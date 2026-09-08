import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestExperience } from "./invest/invest-experience";
import { SavingsExperience } from "./savings/savings-experience";
import type { MorphoVaultsResult } from "@/server/morpho/types";

const vaultsFixture: MorphoVaultsResult = {
  version: "v1",
  chainId: 8453,
  asset: {
    address: "0x1111111111111111111111111111111111111111",
    symbol: "USDC",
    decimals: 6,
  },
  candidates: [
    {
      version: "v1",
      vaultAddress: "0x2222222222222222222222222222222222222222",
      name: "USDC Prime",
      symbol: "usdcP",
      listed: true,
      chainId: 8453,
      asset: {
        address: "0x1111111111111111111111111111111111111111",
        symbol: "USDC",
        decimals: 6,
      },
      curatorAddress: "0x3333333333333333333333333333333333333333",
      grossApy: 0.05,
      netApy: 0.045,
      feeRate: 0.005,
      totalAssetsRaw: "1250000000",
      liquidityRaw: "500000000",
      stateAsOf: "2026-09-07T20:00:00.000Z",
      blockNumber: "35123456",
      source: {
        provider: "Morpho GraphQL",
        endpoint: "https://api.morpho.org/graphql",
        query: "vaults",
        fetchedAt: "2026-09-07T20:30:00.000Z",
      },
    },
  ],
  source: {
    provider: "Morpho GraphQL",
    endpoint: "https://api.morpho.org/graphql",
    query: "vaults",
    fetchedAt: "2026-09-07T20:30:00.000Z",
  },
  stale: false,
};

describe("finance-first presentation", () => {
  test("puts investable asset rows ahead of contract disclosures without invented prices", () => {
    const markup = renderToStaticMarkup(<InvestExperience />);

    expect(markup).toContain('id="invest-stocks-title"');
    expect(markup).toContain("NVIDIA");
    expect(markup).toContain("Degen");
    expect(markup).toContain("Bitcoin");
    expect(markup).toContain("cbBTC token representation · Base 8453");
    expect(markup).toContain("Price unavailable");
    expect(markup).not.toContain(">0.00<");
    expect(markup.indexOf("NVIDIA")).toBeLessThan(
      markup.indexOf("Stock contracts, eligibility, and sources"),
    );
    expect(markup.indexOf("Degen")).toBeLessThan(
      markup.indexOf("Meme contracts, risks, and sources"),
    );
    expect(markup.indexOf("Bitcoin")).toBeLessThan(
      markup.indexOf("Wrapped token contracts, backing, and source"),
    );
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Sign transaction");
  });

  test("labels a crypto snapshot per wrapped token without implying native-asset parity", () => {
    const markup = renderToStaticMarkup(
      <InvestExperience
        cryptoMarket={{
          status: "ready",
          snapshots: [
            {
              assetId: "cbbtc",
              displayPrice: "$100,000 supplied",
              asOf: "2026-09-07T20:00:00.000Z",
              sourceLabel: "Crypto fixture",
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Bitcoin");
    expect(markup).toContain("BTC");
    expect(markup).toContain("cbBTC token representation");
    expect(markup).toContain("Per cbBTC token");
    expect(markup).toContain("$100,000 supplied");
    expect(markup).not.toContain("1 cbBTC = 1 BTC");
    expect(markup).not.toContain("cbETH");
  });

  test("keeps the supplied price provenance link on an asset row", () => {
    const markup = renderToStaticMarkup(
      <InvestExperience stockMarket={{
        status: "ready",
        snapshots: [{
          assetId: "nvdac",
          displayPrice: "$123.45",
          asOf: "2026-09-07T20:00:00.000Z",
          sourceLabel: "Price fixture",
          sourceUrl: "https://prices.example.test/nvdac",
        }],
      }} />,
    );
    expect(markup).toContain('href="https://prices.example.test/nvdac"');
    expect(markup).toContain("Price fixture");
    expect(markup).toContain("$123.45");
  });

  test("leads savings with an unavailable USDC position and leaves every vault unselected", () => {
    const markup = renderToStaticMarkup(
      <SavingsExperience initialData={vaultsFixture} />,
    );

    expect(markup.indexOf("USDC balance")).toBeLessThan(
      markup.indexOf("Vault candidates"),
    );
    expect(markup).toContain("Position details remain private until account verification.");
    expect(markup).toContain("Variable net APY");
    expect(markup).toContain("Fetched snapshot");
    expect(markup).toContain("4.50%");
    expect(markup).not.toContain("aria-pressed");
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });
});
