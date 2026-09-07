import { afterEach, describe, expect, test } from "bun:test";
import {
  clearMorphoCacheForTests,
  getMorphoVaultCandidates,
  getMorphoVaultPosition,
  MorphoUpstreamError,
} from "./client";
import {
  BASE_USDC_ADDRESS,
  MORPHO_V1_CANDIDATE_ADDRESSES,
} from "./config";
import type { Address } from "./types";

afterEach(() => clearMorphoCacheForTests());

const now = () => new Date("2026-09-07T20:30:00.000Z");

function responseFetch(body: unknown, status = 200) {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

function candidate(address: string = MORPHO_V1_CANDIDATE_ADDRESSES[0]) {
  return {
    address,
    name: "Gauntlet USDC Prime",
    symbol: "gtUSDCp",
    listed: true,
    chain: { id: 8453, network: "Base" },
    asset: { address: BASE_USDC_ADDRESS, symbol: "USDC", decimals: 6 },
    state: {
      timestamp: 1788811200,
      blockNumber: 35123456,
      apy: 0.04,
      netApy: 0.035,
      fee: 0,
      curator: "0x9E33faAE38ff641094fa68c65c2cE600b3410585",
      totalAssets: 1000000,
    },
    liquidity: { underlying: 750000 },
  };
}

describe("getMorphoVaultCandidates", () => {
  test("returns only configured Base USDC V1 candidates with provenance", async () => {
    const result = await getMorphoVaultCandidates({
      fetchImpl: responseFetch({
        data: {
          vaults: {
            items: [
              candidate(),
              candidate("0x1111111111111111111111111111111111111111"),
            ],
          },
        },
      }),
      now,
    });

    expect(result.version).toBe("v1");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.totalAssetsRaw).toBe("1000000");
    expect(result.source.fetchedAt).toBe("2026-09-07T20:30:00.000Z");
    expect(result.stale).toBeFalse();
  });

  test("surfaces an upstream HTTP failure instead of inventing empty data", async () => {
    await expect(
      getMorphoVaultCandidates({
        fetchImpl: responseFetch({ error: "rate limited" }, 429),
        now,
      }),
    ).rejects.toBeInstanceOf(MorphoUpstreamError);
  });

  test("surfaces GraphQL errors instead of normalizing them as zero", async () => {
    await expect(
      getMorphoVaultCandidates({
        fetchImpl: responseFetch({
          data: null,
          errors: [{ message: "schema changed" }],
        }),
        now,
      }),
    ).rejects.toBeInstanceOf(MorphoUpstreamError);
  });
});

describe("getMorphoVaultPosition", () => {
  const account = {
    address: "0x2222222222222222222222222222222222222222" as Address,
    verification: "caller-verified-session-smart-account" as const,
  };

  test("requires a configured vault", async () => {
    await expect(
      getMorphoVaultPosition({
        account,
        vaultAddress: "0x1111111111111111111111111111111111111111",
        fetchImpl: responseFetch({ data: { vaultPosition: null } }),
      }),
    ).rejects.toThrow("configured vaults");
  });

  test("keeps indexed assets separate from current withdrawable amount", async () => {
    const vaultAddress = MORPHO_V1_CANDIDATE_ADDRESSES[0];
    const result = await getMorphoVaultPosition({
      account,
      vaultAddress,
      fetchImpl: responseFetch({
        data: {
          vaultPosition: {
            vault: {
              address: vaultAddress,
              chain: { id: 8453 },
              asset: { address: BASE_USDC_ADDRESS, decimals: 6 },
            },
            state: {
              timestamp: 1788811200,
              assets: 123456789,
              shares: 120000000,
            },
          },
        },
      }),
      now,
    });

    expect(result?.assetsRaw).toBe("123456789");
    expect(result?.sharesRaw).toBe("120000000");
    expect(result?.withdrawableRaw).toBeNull();
    expect(result?.withdrawableNote).toContain("maxWithdraw");
  });

  test("returns null when the index has no position instead of zero", async () => {
    const result = await getMorphoVaultPosition({
      account,
      vaultAddress: MORPHO_V1_CANDIDATE_ADDRESSES[0],
      fetchImpl: responseFetch({ data: { vaultPosition: null } }),
      now,
    });

    expect(result).toBeNull();
  });
});
