import "@/features/account/dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { VerifiedAccountSession } from "@/features/account/session-types";
import type { BaseErc20TransferPage } from "@/server/chain-data/types";

const { act, cleanup, render, waitFor, within } = await import("@testing-library/react");
const { ActivityList, useActivity } = await import("./activity-list");

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

function session(address: typeof ADDRESS_A | typeof ADDRESS_B): VerifiedAccountSession {
  return {
    user: { subject: address === ADDRESS_A ? "subject-a" : "subject-b" },
    smartAccount: { address, chainId: 8453 },
    accountProvider: "cdp-embedded",
  };
}

function page(amount: string): BaseErc20TransferPage {
  return {
    transfers: [{
      id: `transfer-${amount}`,
      chainId: 8453,
      assetId: "usdc",
      tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      walletAddress: ADDRESS_A,
      fromAddress: ADDRESS_B,
      toAddress: ADDRESS_A,
      direction: "incoming",
      amountBaseUnits: amount,
      blockNumber: "1",
      blockHash: `0x${"aa".repeat(32)}`,
      transactionHash: `0x${"bb".repeat(32)}`,
      logIndex: "0",
      blockTimestamp: "2026-09-07T20:30:00.000Z",
    }],
    nextCursor: null,
    source: {
      provider: "cdp-sql",
      cached: false,
      stale: false,
      executionTimestamp: "2026-09-07T20:30:00.000Z",
      executionTimeMs: 1,
      fetchedAt: "2026-09-07T20:30:01.000Z",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Harness({
  value,
  fetchActivity,
}: {
  value: VerifiedAccountSession | null;
  fetchActivity: (signal?: AbortSignal) => Promise<unknown>;
}) {
  return <ActivityList state={useActivity(value, fetchActivity)} />;
}

afterEach(cleanup);

describe("authenticated activity UI", () => {
  test("renders exact supported USDC fixture amounts and source scope", async () => {
    render(<Harness value={session(ADDRESS_A)} fetchActivity={async () => page("1234567")} />);
    expect(await within(document.body).findByText("1.234567 USDC")).toBeTruthy();
    expect(within(document.body).getByText(/USDC transfers only/)).toBeTruthy();
  });

  test("clears prior wallet data immediately and discards its delayed response", async () => {
    const pendingB = deferred<unknown>();
    const view = render(
      <Harness value={session(ADDRESS_A)} fetchActivity={async () => page("99000000")} />,
    );
    await within(document.body).findByText("99 USDC");

    view.rerender(
      <Harness value={session(ADDRESS_B)} fetchActivity={() => pendingB.promise} />,
    );
    await within(document.body).findByText("Loading supported USDC activity…");
    expect(within(document.body).queryByText("99 USDC")).toBeNull();

    view.rerender(<Harness value={null} fetchActivity={() => pendingB.promise} />);
    expect(within(document.body).getByText(/remains private/)).toBeTruthy();
    await act(async () => {
      pendingB.resolve(page("2500000"));
      await pendingB.promise;
    });
    await waitFor(() => expect(within(document.body).queryByText("2.5 USDC")).toBeNull());
  });
});
