import { describe, expect, test } from "bun:test";
import {
  buildBaseErc20TransferQuery,
  createBaseErc20TransferHistory,
  decodeTransferCursor,
} from "./base-erc20-transfers";
import { ChainDataError } from "./errors";
import type { BaseErc20Asset, CdpSqlTransport } from "./types";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const TX_A = `0x${"a".repeat(64)}` as const;
const TX_B = `0x${"b".repeat(64)}` as const;
const BLOCK = `0x${"c".repeat(64)}` as const;
const NOW = new Date("2026-09-07T12:00:00.000Z");
const assets = [
  { id: "verified-usdc", chainId: 8453, address: TOKEN },
] as const satisfies readonly BaseErc20Asset[];

function input(overrides: Record<string, unknown> = {}) {
  return {
    verifiedWalletAddress: WALLET,
    assetIds: ["verified-usdc"],
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    log_id: "base:event:1",
    block_number: "18446744073709551615",
    block_hash: BLOCK,
    source_timestamp: "2026-09-07T11:59:00.000Z",
    transaction_hash: TX_A,
    log_index: "4294967295",
    token_address: TOKEN,
    from_address: OTHER,
    to_address: WALLET,
    amount_base_units: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    ...overrides,
  };
}

function transportFor(result: unknown[]): CdpSqlTransport {
  return {
    async run() {
      return {
        result,
        schema: { columns: [] },
        metadata: {
          cached: true,
          executionTimestamp: "2026-09-07T11:58:00.000Z",
          executionTimeMs: 12,
          rowCount: result.length,
        },
      };
    },
  };
}

describe("Base ERC20 transfer query", () => {
  test("constructs a bounded, scoped, re-org-aware fixed template", () => {
    const { sql } = buildBaseErc20TransferQuery(input(), assets, NOW);

    expect(sql).toContain("FROM base.events");
    expect(sql).toContain("GROUP BY log_id");
    expect(sql).toContain("HAVING sum(toInt8(action)) > 0");
    expect(sql).toContain(`lower(toString(parameters['from'])) = '${WALLET}'`);
    expect(sql).toContain(`lower(toString(parameters['to'])) = '${WALLET}'`);
    expect(sql).toContain(`lower(toString(address)) IN ('${TOKEN}')`);
    expect(sql).toContain("any(toString(parameters['value'])) AS amount_base_units");
    expect(sql).toContain("LIMIT 51");
    expect(sql).not.toContain("SELECT *");
  });

  test("rejects address injection and non-allowlisted assets", () => {
    expect(() =>
      buildBaseErc20TransferQuery(
        input({ verifiedWalletAddress: `${WALLET}' OR 1=1 --` }),
        assets,
        NOW,
      ),
    ).toThrow(ChainDataError);
    expect(() =>
      buildBaseErc20TransferQuery(
        input({ assetIds: ["verified-usdc') OR 1=1 --"] }),
        assets,
        NOW,
      ),
    ).toThrow("Requested asset is not allowlisted");
  });

  test("enforces page, time, future, and cache bounds", () => {
    expect(() =>
      buildBaseErc20TransferQuery(input({ limit: 201 }), assets, NOW),
    ).toThrow("page size");
    expect(() =>
      buildBaseErc20TransferQuery(
        input({ from: "2026-07-01T00:00:00Z" }),
        assets,
        NOW,
      ),
    ).toThrow("31 days");
    expect(() =>
      buildBaseErc20TransferQuery(
        input({ to: "2026-09-08T00:00:00Z" }),
        assets,
        NOW,
      ),
    ).toThrow("future");
    expect(() =>
      buildBaseErc20TransferQuery(input({ cacheMaxAgeMs: 499 }), assets, NOW),
    ).toThrow("cache age");
  });
});

describe("Base ERC20 transfer adapter", () => {
  test("preserves uint256 and index values as strings and marks stale cached data", async () => {
    const history = createBaseErc20TransferHistory({
      assets,
      transport: transportFor([row()]),
      now: () => NOW,
    });

    const page = await history.listTransfers(input({ staleAfterMs: 60_000 }));

    expect(page.transfers[0]?.amountBaseUnits).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    );
    expect(page.transfers[0]?.blockNumber).toBe("18446744073709551615");
    expect(page.transfers[0]?.logIndex).toBe("4294967295");
    expect(page.transfers[0]?.direction).toBe("incoming");
    expect(page.source.cached).toBe(true);
    expect(page.source.stale).toBe(true);
    expect(page.source.executionTimestamp).toBe("2026-09-07T11:58:00.000Z");
  });

  test("creates a deterministic keyset cursor from the final returned row", async () => {
    const history = createBaseErc20TransferHistory({
      assets,
      transport: transportFor([
        row({ log_id: "base:event:2", transaction_hash: TX_B, log_index: "2" }),
        row({ log_id: "base:event:1", transaction_hash: TX_A, log_index: "1" }),
      ]),
      now: () => NOW,
    });

    const page = await history.listTransfers(input({ limit: 1 }));
    expect(page.transfers).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeTransferCursor(page.nextCursor!)).toEqual({
      blockNumber: "18446744073709551615",
      transactionHash: TX_B,
      logIndex: "2",
      logId: "base:event:2",
    });

    const { sql } = buildBaseErc20TransferQuery(
      input({ cursor: page.nextCursor }),
      assets,
      NOW,
    );
    expect(sql).toContain("block_number < toUInt64('18446744073709551615')");
    expect(sql).toContain(`transaction_hash < '${TX_B}'`);
  });

  test("rejects numeric uint256 values before they can lose precision", async () => {
    const history = createBaseErc20TransferHistory({
      assets,
      transport: transportFor([row({ amount_base_units: 9007199254740992 })]),
      now: () => NOW,
    });

    await expect(history.listTransfers(input())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  test("rejects rows outside the verified wallet or asset scope", async () => {
    const unscopedWallet = createBaseErc20TransferHistory({
      assets,
      transport: transportFor([
        row({
          from_address: OTHER,
          to_address: "0x4444444444444444444444444444444444444444",
        }),
      ]),
      now: () => NOW,
    });
    await expect(unscopedWallet.listTransfers(input())).rejects.toMatchObject({
      code: "invalid-response",
    });

    const unscopedAsset = createBaseErc20TransferHistory({
      assets,
      transport: transportFor([
        row({ token_address: "0x5555555555555555555555555555555555555555" }),
      ]),
      now: () => NOW,
    });
    await expect(unscopedAsset.listTransfers(input())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  test("rejects invalid metadata and mismatched row counts", async () => {
    const history = createBaseErc20TransferHistory({
      assets,
      transport: {
        async run() {
          return {
            result: [row()],
            schema: { columns: [] },
            metadata: {
              cached: false,
              executionTimestamp: "not-a-date",
              executionTimeMs: 1,
              rowCount: 0,
            },
          };
        },
      },
      now: () => NOW,
    });

    await expect(history.listTransfers(input())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
