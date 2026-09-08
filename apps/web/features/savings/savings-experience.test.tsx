import "@/features/account/dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { VerifiedAccountSession } from "@/features/account/session-types";
import type { MorphoVaultsResult } from "@/server/morpho/types";
import { MORPHO_V1_CANDIDATE_ADDRESSES } from "@/server/morpho/config";

const { act, cleanup, render, within } = await import("@testing-library/react");
const { SavingsExperience } = await import("./savings-experience");

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const VAULT = MORPHO_V1_CANDIDATE_ADDRESSES[0];

const initialData: MorphoVaultsResult = {
  version: "v1",
  chainId: 8453,
  asset: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
  },
  candidates: [],
  source: {
    provider: "Morpho GraphQL",
    endpoint: "https://api.morpho.org/graphql",
    query: "vaults",
    fetchedAt: "2026-09-07T20:30:00.000Z",
  },
  stale: false,
};

function session(address: typeof ADDRESS_A | typeof ADDRESS_B): VerifiedAccountSession {
  return {
    user: { subject: address === ADDRESS_A ? "subject-a" : "subject-b" },
    smartAccount: { address, chainId: 8453 },
    accountProvider: "cdp-embedded",
  };
}

function positions(address: typeof ADDRESS_A | typeof ADDRESS_B, assetsRaw: string | null) {
  return {
    accountAddress: address,
    fetchedAt: "2026-09-07T20:30:02.000Z",
    vaults: [{
      vaultAddress: VAULT,
      position: assetsRaw === null ? null : {
        version: "v1",
        accountAddress: address,
        vaultAddress: VAULT,
        assetsRaw,
        sharesRaw: "1200000",
        indexedAt: "2026-09-07T20:30:01.000Z",
        source: {
          provider: "Morpho GraphQL",
          endpoint: "https://api.morpho.org/graphql",
          query: "vaultPosition",
          fetchedAt: "2026-09-07T20:30:02.000Z",
        },
        withdrawableRaw: null,
        withdrawableNote: "No maxWithdraw query was made.",
      },
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(cleanup);

describe("authenticated savings positions UI", () => {
  test("renders indexed assets and shares without claiming max withdraw", async () => {
    render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, "123456789")}
      />,
    );

    expect(await within(document.body).findByText("123.456789 USDC")).toBeTruthy();
    expect(within(document.body).getByText("1,200,000")).toBeTruthy();
    expect(within(document.body).getByText(/no maxWithdraw claim/i)).toBeTruthy();
  });

  test("distinguishes no indexed position from zero spendable balance", async () => {
    render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, null)}
      />,
    );
    expect(await within(document.body).findByText(/No indexed position was found/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("0 USDC");
  });

  test("clears positions on account switch and ignores a late prior-wallet result", async () => {
    const pending = deferred<unknown>();
    const view = render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, "99000000")}
      />,
    );
    await within(document.body).findByText("99 USDC");

    view.rerender(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_B)}
        fetchPositions={() => pending.promise}
      />,
    );
    await within(document.body).findByText("Loading supported vault positions…");
    expect(within(document.body).queryByText("99 USDC")).toBeNull();

    view.rerender(<SavingsExperience initialData={initialData} session={null} fetchPositions={() => pending.promise} />);
    await act(async () => {
      pending.resolve(positions(ADDRESS_B, "2500000"));
      await pending.promise;
    });
    expect(within(document.body).queryByText("2.5 USDC")).toBeNull();
    expect(within(document.body).getByText(/remain private/)).toBeTruthy();
  });
});
